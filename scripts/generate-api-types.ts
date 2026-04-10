/**
 * NestJS 백엔드 DTO/컨트롤러를 파싱하여 Python/TypeScript용 API 타입 정의를 자동 생성하는 스크립트.
 *
 * 사용법: npm run generate:types
 *
 * ts-morph를 사용하여 AST 레벨에서 정확하게 파싱합니다.
 */

import { Project, SyntaxKind, Node, PropertyDeclaration, EnumDeclaration, ClassDeclaration, VariableDeclaration, SourceFile, MethodDeclaration } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';

// ─────────────────────────────────────────────
// 경로 설정
// ─────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const INTEGRATION_DIR = path.join(ROOT, 'yjlaser_website', 'webhard-api', 'src', 'integration');

const DTO_FILES = [
  path.join(INTEGRATION_DIR, 'orders', 'dto', 'order.dto.ts'),
  path.join(INTEGRATION_DIR, 'delivery', 'dto', 'delivery.dto.ts'),
  path.join(INTEGRATION_DIR, 'inventory', 'dto', 'inventory.dto.ts'),
  path.join(INTEGRATION_DIR, 'events', 'dto', 'event.dto.ts'),
  path.join(INTEGRATION_DIR, 'programs', 'dto', 'program.dto.ts'),
  path.join(INTEGRATION_DIR, 'sync-log', 'dto', 'sync-log.dto.ts'),
  path.join(INTEGRATION_DIR, 'orders', 'dto', 'auto-contact.dto.ts'),
  path.join(INTEGRATION_DIR, 'auth', 'api-key.controller.ts'), // CreateApiKeyDto 인라인 정의
];

const CONTROLLER_FILES = [
  path.join(INTEGRATION_DIR, 'orders', 'orders.controller.ts'),
  path.join(INTEGRATION_DIR, 'orders', 'auto-contact.controller.ts'),
  path.join(INTEGRATION_DIR, 'delivery', 'delivery.controller.ts'),
  path.join(INTEGRATION_DIR, 'inventory', 'inventory.controller.ts'),
  path.join(INTEGRATION_DIR, 'events', 'events.controller.ts'),
  path.join(INTEGRATION_DIR, 'programs', 'programs.controller.ts'),
  path.join(INTEGRATION_DIR, 'sync-log', 'sync-log.controller.ts'),
  path.join(INTEGRATION_DIR, 'auth', 'api-key.controller.ts'),
  path.join(INTEGRATION_DIR, 'file-transfer', 'file-transfer.controller.ts'),
];

const OUTPUT_PYTHON_PATHS = [
  path.join(ROOT, '유진레이저목형 관리프로그램', 'generated', 'api_types.py'),
  path.join(ROOT, '레이저네스팅프로그램', 'generated', 'api_types.py'),
];

const OUTPUT_TS_PATH = path.join(ROOT, '외부웹하드동기화프로그램', 'src', 'generated', 'api_types.ts');

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

interface EnumInfo {
  name: string;
  members: { key: string; value: string }[];
}

interface FieldInfo {
  name: string;
  tsType: string;
  pyType: string;
  optional: boolean;
  defaultValue?: string;
  enumRef?: string;
}

interface DtoInfo {
  name: string;
  fields: FieldInfo[];
}

interface ConstInfo {
  name: string;
  text: string; // 원본 initializer 텍스트
  type: 'record' | 'array';
}

interface EndpointInfo {
  method: string; // GET, POST, PATCH, DELETE
  path: string; // full path (e.g., /api/v1/integration/orders)
  handlerName: string;
  dtoName?: string;
  paramName?: string; // :id 등
}

// ─────────────────────────────────────────────
// AST 파싱
// ─────────────────────────────────────────────

function parseEnums(sourceFile: SourceFile): EnumInfo[] {
  const enums: EnumInfo[] = [];
  for (const enumDecl of sourceFile.getEnums()) {
    if (!enumDecl.isExported()) continue;
    enums.push({
      name: enumDecl.getName(),
      members: enumDecl.getMembers().map(m => ({
        key: m.getName(),
        value: m.getValue() as string,
      })),
    });
  }
  return enums;
}

function parseConsts(sourceFile: SourceFile): ConstInfo[] {
  const consts: ConstInfo[] = [];
  for (const varStmt of sourceFile.getVariableStatements()) {
    if (!varStmt.isExported()) continue;
    for (const decl of varStmt.getDeclarations()) {
      const name = decl.getName();
      // OrderStatus alias는 스킵 (enum 재할당)
      if (name === 'OrderStatus') continue;

      const initializer = decl.getInitializer();
      if (!initializer) continue;

      const text = initializer.getText();

      // 배열 vs 객체 판별: ArrayLiteralExpression 또는 'as const' 배열은 array, 나머지는 record
      const isArray = initializer.getKind() === SyntaxKind.ArrayLiteralExpression ||
        (text.includes('as const') && text.trimStart().startsWith('['));

      if (isArray) {
        consts.push({ name, text: text.replace(/\s*as\s+const\s*$/, ''), type: 'array' });
      } else if (name.startsWith('VALID_') || name.includes('TRANSITIONS') ||
                 initializer.getKind() === SyntaxKind.ObjectLiteralExpression) {
        consts.push({ name, text, type: 'record' });
      }
    }
  }
  return consts;
}

function resolveFieldType(prop: PropertyDeclaration, sourceEnums: Map<string, EnumInfo>): { tsType: string; pyType: string; enumRef?: string } {
  // 데코레이터에서 타입 힌트 추출
  const decorators = prop.getDecorators();
  const decoratorNames = decorators.map(d => d.getName());

  // @IsEnum(EnumType) 체크
  for (const dec of decorators) {
    if (dec.getName() === 'IsEnum') {
      const args = dec.getArguments();
      if (args.length > 0) {
        const enumName = args[0].getText();
        if (sourceEnums.has(enumName)) {
          return { tsType: enumName, pyType: 'str', enumRef: enumName };
        }
      }
    }
  }

  // TypeScript 타입 어노테이션
  const typeNode = prop.getTypeNode();
  const typeText = typeNode ? typeNode.getText() : undefined;

  if (typeText) {
    // union 타입 처리 (e.g., 'asc' | 'desc', string | null)
    if (typeText.includes('Record<')) {
      return { tsType: typeText, pyType: 'dict' };
    }
    if (typeText.includes('|')) {
      const parts = typeText.split('|').map(p => p.trim());
      const nonNull = parts.filter(p => p !== 'null');
      if (nonNull.every(p => p.startsWith("'"))) {
        // 리터럴 유니온 (e.g., 'asc' | 'desc')
        return { tsType: typeText, pyType: 'str' };
      }
      if (nonNull.length === 1 && nonNull[0] === 'string') {
        return { tsType: 'string | null', pyType: 'Optional[str]' };
      }
    }
    if (typeText === 'CreateEventDto[]') {
      return { tsType: 'CreateEventDto[]', pyType: 'List[dict]' };
    }
  }

  // 데코레이터 기반 타입 추론 (순서 중요: @IsArray를 @IsString보다 먼저 체크)
  if (decoratorNames.includes('IsArray')) {
    // ValidateNested + Type(() => CreateEventDto) 체크
    for (const dec of decorators) {
      if (dec.getName() === 'Type') {
        const argText = dec.getArguments().map(a => a.getText()).join('');
        if (argText.includes('CreateEventDto')) {
          return { tsType: 'CreateEventDto[]', pyType: 'List[dict]' };
        }
      }
    }
    return { tsType: 'string[]', pyType: 'List[str]' };
  }
  if (decoratorNames.includes('IsInt') || decoratorNames.includes('IsNumber')) {
    return { tsType: 'number', pyType: decoratorNames.includes('IsInt') ? 'int' : 'float' };
  }
  if (decoratorNames.includes('IsBoolean')) {
    return { tsType: 'boolean', pyType: 'bool' };
  }
  if (decoratorNames.includes('IsObject')) {
    return { tsType: 'Record<string, unknown>', pyType: 'dict' };
  }
  if (decoratorNames.includes('IsUUID') || decoratorNames.includes('IsString') || decoratorNames.includes('IsDateString') || decoratorNames.includes('IsNotEmpty')) {
    return { tsType: 'string', pyType: 'str' };
  }

  // fallback: TypeScript 타입 어노테이션 사용
  if (typeText === 'number') return { tsType: 'number', pyType: 'int' };
  if (typeText === 'string') return { tsType: 'string', pyType: 'str' };
  if (typeText === 'boolean') return { tsType: 'boolean', pyType: 'bool' };

  return { tsType: 'unknown', pyType: 'Any' };
}

function parseDtos(sourceFile: SourceFile, allEnums: Map<string, EnumInfo>): DtoInfo[] {
  const dtos: DtoInfo[] = [];
  for (const cls of sourceFile.getClasses()) {
    const className = cls.getName();
    if (!className || !className.endsWith('Dto')) continue;

    const fields: FieldInfo[] = [];
    for (const prop of cls.getProperties()) {
      const decoratorNames = prop.getDecorators().map(d => d.getName());
      const optional = prop.hasQuestionToken() || decoratorNames.includes('IsOptional');
      const { tsType, pyType, enumRef } = resolveFieldType(prop, allEnums);

      // 기본값 추출
      const initializer = prop.getInitializer();
      let defaultValue: string | undefined;
      if (initializer) {
        defaultValue = initializer.getText();
      }

      fields.push({
        name: prop.getName(),
        tsType,
        pyType,
        optional,
        defaultValue,
        enumRef,
      });
    }
    dtos.push({ name: className, fields });
  }
  return dtos;
}

function parseEndpoints(sourceFile: SourceFile): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];

  for (const cls of sourceFile.getClasses()) {
    // @Controller('path') 데코레이터에서 기본 경로 추출
    const controllerDec = cls.getDecorator('Controller');
    if (!controllerDec) continue;
    const controllerArgs = controllerDec.getArguments();
    if (controllerArgs.length === 0) continue;

    let basePath = controllerArgs[0].getText().replace(/['"]/g, '');
    basePath = `/api/v1/${basePath}`;

    for (const method of cls.getMethods()) {
      const httpMethods = ['Get', 'Post', 'Patch', 'Put', 'Delete'];
      for (const httpMethod of httpMethods) {
        const dec = method.getDecorator(httpMethod);
        if (!dec) continue;

        const args = dec.getArguments();
        let subPath = '';
        if (args.length > 0) {
          subPath = '/' + args[0].getText().replace(/['"]/g, '');
        }

        const fullPath = basePath + subPath;

        // DTO 파라미터 추출
        let dtoName: string | undefined;
        let paramName: string | undefined;

        for (const param of method.getParameters()) {
          const bodyDec = param.getDecorator('Body');
          if (bodyDec) {
            const paramType = param.getTypeNode();
            if (paramType) {
              dtoName = paramType.getText();
            }
          }
          const paramDec = param.getDecorator('Param');
          if (paramDec) {
            const paramArgs = paramDec.getArguments();
            if (paramArgs.length > 0) {
              paramName = paramArgs[0].getText().replace(/['"]/g, '');
            }
          }
        }

        endpoints.push({
          method: httpMethod.toUpperCase(),
          path: fullPath,
          handlerName: method.getName(),
          dtoName,
          paramName,
        });
      }
    }
  }
  return endpoints;
}

// ─────────────────────────────────────────────
// Python 코드 생성
// ─────────────────────────────────────────────

function generatePython(enums: EnumInfo[], dtos: DtoInfo[], consts: ConstInfo[], endpoints: EndpointInfo[]): string {
  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  lines.push('"""');
  lines.push('자동 생성된 API 타입 정의 파일입니다. 직접 수정하지 마세요.');
  lines.push(`생성 시각: ${now}`);
  lines.push('소스: yjlaser_website/webhard-api/src/integration/');
  lines.push('생성 명령: npm run generate:types');
  lines.push('"""');
  lines.push('');
  lines.push('from typing import Any, Dict, List, Optional');
  lines.push('');
  lines.push('');

  // ── Enums ──
  lines.push('# ' + '='.repeat(60));
  lines.push('# Enum 정의');
  lines.push('# ' + '='.repeat(60));
  lines.push('');

  for (const e of enums) {
    lines.push(`class ${e.name}:`);
    lines.push(`    """${e.name} enum 값."""`);
    for (const m of e.members) {
      lines.push(`    ${m.key} = '${m.value}'`);
    }
    lines.push('');
    lines.push(`    _values = {${e.members.map(m => `'${m.value}'`).join(', ')}}`);
    lines.push('');
    lines.push('    @classmethod');
    lines.push('    def is_valid(cls, value):');
    lines.push(`        # type: (str) -> bool`);
    lines.push('        return value in cls._values');
    lines.push('');
    lines.push('');
  }

  // ── Const 객체 ──
  lines.push('# ' + '='.repeat(60));
  lines.push('# 상수 정의');
  lines.push('# ' + '='.repeat(60));
  lines.push('');

  for (const c of consts) {
    if (c.type === 'record') {
      // Record<string, string[]> → dict
      const pyDict = convertTsPropToDict(c.text);
      lines.push(`${c.name} = ${pyDict}`);
    } else {
      // array → list
      const pyList = convertTsArrayToList(c.text);
      lines.push(`${c.name} = ${pyList}`);
    }
    lines.push('');
  }
  lines.push('');

  // ── DTO TypedDict ──
  lines.push('# ' + '='.repeat(60));
  lines.push('# DTO TypedDict 정의');
  lines.push('# ' + '='.repeat(60));
  lines.push('');

  for (const dto of dtos) {
    const requiredFields = dto.fields.filter(f => !f.optional);
    const optionalFields = dto.fields.filter(f => f.optional);

    if (requiredFields.length > 0 && optionalFields.length > 0) {
      // 필수 필드가 있는 기본 클래스
      lines.push(`class _${dto.name}Required(dict):`);
      lines.push(`    """${dto.name} 필수 필드."""`);
      for (const f of requiredFields) {
        const pyType = getPythonFieldType(f);
        lines.push(`    ${f.name} = None  # type: ${pyType}`);
      }
      lines.push('');
      lines.push('');

      // TypedDict는 Python 3.8에서 total=False로 선택적 필드 지원
      // 하지만 dict 기반으로 더 실용적인 접근
    }

    // 통합 클래스
    lines.push(`class ${dto.name}:`);
    lines.push(`    """${dto.name} 타입 정의."""`);
    lines.push('');

    // 필드를 문서화
    if (dto.fields.length === 0) {
      lines.push('    pass');
    } else {
      // 필수 필드
      if (requiredFields.length > 0) {
        lines.push('    # 필수 필드');
        for (const f of requiredFields) {
          const pyType = getPythonFieldType(f);
          if (f.defaultValue !== undefined) {
            lines.push(`    ${f.name} = ${convertDefaultValue(f.defaultValue)}  # type: ${pyType}`);
          } else {
            lines.push(`    ${f.name} = None  # type: ${pyType}`);
          }
        }
      }

      // 선택적 필드
      if (optionalFields.length > 0) {
        if (requiredFields.length > 0) lines.push('');
        lines.push('    # 선택적 필드');
        for (const f of optionalFields) {
          const pyType = getPythonFieldType(f);
          if (f.defaultValue !== undefined) {
            lines.push(`    ${f.name} = ${convertDefaultValue(f.defaultValue)}  # type: Optional[${pyType}]`);
          } else {
            lines.push(`    ${f.name} = None  # type: Optional[${pyType}]`);
          }
        }
      }

      // _fields 메타데이터
      lines.push('');
      lines.push('    _required_fields = [' + requiredFields.map(f => `'${f.name}'`).join(', ') + ']');
      lines.push('    _optional_fields = [' + optionalFields.map(f => `'${f.name}'`).join(', ') + ']');
    }

    lines.push('');
    lines.push('    @classmethod');
    lines.push('    def create(cls, **kwargs):');
    lines.push('        # type: (**Any) -> dict');
    lines.push(`        """${dto.name} dict를 생성합니다. 필수 필드 누락 시 ValueError."""`);
    lines.push('        for field in cls._required_fields:');
    lines.push('            if field not in kwargs:');
    lines.push(`                raise ValueError(f"필수 필드 누락: {field}")`);
    lines.push('        return {k: v for k, v in kwargs.items() if v is not None}');
    lines.push('');
    lines.push('');
  }

  // ── 엔드포인트 상수 ──
  lines.push('# ' + '='.repeat(60));
  lines.push('# API 엔드포인트 정의');
  lines.push('# ' + '='.repeat(60));
  lines.push('');
  lines.push('class ApiEndpoints:');
  lines.push('    """API 엔드포인트 경로 상수."""');
  lines.push('');

  // 엔드포인트를 카테고리별로 그룹화
  const grouped = new Map<string, EndpointInfo[]>();
  for (const ep of endpoints) {
    // /api/v1/integration/{category}/... → category 추출
    const parts = ep.path.split('/');
    const category = parts[4] || 'unknown'; // integration 다음
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push(ep);
  }

  for (const [category, eps] of grouped) {
    lines.push(`    # ${category}`);
    for (const ep of eps) {
      const constName = endpointToConstName(ep, category);
      lines.push(`    ${constName} = '${ep.path}'`);
    }
    lines.push('');
  }

  lines.push('');
  lines.push('# 편의 상수: API 기본 경로');
  lines.push("API_BASE_PATH = '/api/v1/integration'");
  lines.push('');

  return lines.join('\n');
}

function getPythonFieldType(f: FieldInfo): string {
  if (f.enumRef) return 'str';  // enum은 결국 문자열
  switch (f.pyType) {
    case 'int': return 'int';
    case 'float': return 'float';
    case 'str': return 'str';
    case 'bool': return 'bool';
    case 'dict': return 'Dict[str, Any]';
    case 'List[dict]': return 'List[Dict[str, Any]]';
    case 'List[str]': return 'List[str]';
    case 'Optional[str]': return 'str';
    case 'Any': return 'Any';
    default: return f.pyType;
  }
}

function convertDefaultValue(val: string): string {
  if (val === 'undefined') return 'None';
  // 문자열 리터럴
  if (val.startsWith("'") && val.endsWith("'")) {
    return val;  // Python도 같은 리터럴
  }
  // 숫자
  if (/^\d+$/.test(val)) return val;
  return `'${val}'`;
}

function convertTsPropToDict(text: string): string {
  // TypeScript 객체 → Python dict 변환
  // { key: ['val1', 'val2'], ... } → {'key': ['val1', 'val2'], ...}
  let result = text;
  // 프로퍼티 이름에 따옴표 추가: \bword\b: → 'word':
  result = result.replace(/(\w+):/g, "'$1':");
  // 작은따옴표 내 문자열은 그대로 유지
  return result;
}

function convertTsArrayToList(text: string): string {
  // TypeScript 배열 → Python 리스트
  // ['a', 'b'] → ['a', 'b']
  // 이미 같은 형식이므로 그대로 사용
  return text;
}

function endpointToConstName(ep: EndpointInfo, category: string): string {
  // handler name → SCREAMING_SNAKE_CASE
  const name = ep.handlerName
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '');
  return `${ep.method}_${name}`;
}

// ─────────────────────────────────────────────
// TypeScript 코드 생성
// ─────────────────────────────────────────────

function generateTypeScript(enums: EnumInfo[], dtos: DtoInfo[], consts: ConstInfo[], endpoints: EndpointInfo[]): string {
  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  lines.push('/**');
  lines.push(' * 자동 생성된 API 타입 정의 파일입니다. 직접 수정하지 마세요.');
  lines.push(` * 생성 시각: ${now}`);
  lines.push(' * 소스: yjlaser_website/webhard-api/src/integration/');
  lines.push(' * 생성 명령: npm run generate:types');
  lines.push(' */');
  lines.push('');

  // ── Enums ──
  lines.push('// ' + '='.repeat(60));
  lines.push('// Enum 정의');
  lines.push('// ' + '='.repeat(60));
  lines.push('');

  for (const e of enums) {
    lines.push(`export enum ${e.name} {`);
    for (const m of e.members) {
      lines.push(`  ${m.key} = '${m.value}',`);
    }
    lines.push('}');
    lines.push('');
  }

  // ── Const 객체 ──
  lines.push('// ' + '='.repeat(60));
  lines.push('// 상수 정의');
  lines.push('// ' + '='.repeat(60));
  lines.push('');

  for (const c of consts) {
    if (c.type === 'record') {
      lines.push(`export const ${c.name}: Record<string, string[]> = ${c.text};`);
    } else {
      lines.push(`export const ${c.name} = ${c.text} as const;`);
    }
    lines.push('');
  }

  // ── DTO Interfaces ──
  lines.push('// ' + '='.repeat(60));
  lines.push('// DTO Interface 정의');
  lines.push('// ' + '='.repeat(60));
  lines.push('');

  for (const dto of dtos) {
    lines.push(`export interface ${dto.name.replace('Dto', '')} {`);
    for (const f of dto.fields) {
      const optional = f.optional ? '?' : '';
      let tsType = f.tsType;
      // 간단한 타입 치환 (DTO 참조는 interface 이름으로)
      if (tsType === 'CreateEventDto[]') {
        tsType = 'CreateEvent[]';
      }
      lines.push(`  ${f.name}${optional}: ${tsType};`);
    }
    lines.push('}');
    lines.push('');
  }

  // ── 엔드포인트 상수 ──
  lines.push('// ' + '='.repeat(60));
  lines.push('// API 엔드포인트 정의');
  lines.push('// ' + '='.repeat(60));
  lines.push('');
  lines.push('export const API_BASE_PATH = \'/api/v1/integration\' as const;');
  lines.push('');
  lines.push('export const ApiEndpoints = {');

  // 카테고리별 그룹화
  const grouped = new Map<string, EndpointInfo[]>();
  for (const ep of endpoints) {
    const parts = ep.path.split('/');
    const category = parts[4] || 'unknown';
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push(ep);
  }

  for (const [category, eps] of grouped) {
    lines.push(`  // ${category}`);
    for (const ep of eps) {
      const constName = endpointToConstName(ep, category);
      lines.push(`  ${constName}: '${ep.path}',`);
    }
  }

  lines.push('} as const;');
  lines.push('');

  // 유틸리티 타입
  lines.push('export type ApiEndpointKey = keyof typeof ApiEndpoints;');
  lines.push('export type ApiEndpointPath = typeof ApiEndpoints[ApiEndpointKey];');
  lines.push('');

  return lines.join('\n');
}

// ─────────────────────────────────────────────
// 메인 실행
// ─────────────────────────────────────────────

function main() {
  console.log('API 타입 생성 시작...');
  console.log(`통합 디렉토리: ${INTEGRATION_DIR}`);
  console.log('');

  // ts-morph 프로젝트 생성 (타입 체크 없이 파싱만)
  const project = new Project({
    compilerOptions: {
      strict: true,
      target: 99, // ESNext
    },
    skipAddingFilesFromTsConfig: true,
  });

  // DTO 파일 로드
  const allEnums: EnumInfo[] = [];
  const allDtos: DtoInfo[] = [];
  const allConsts: ConstInfo[] = [];
  const enumMap = new Map<string, EnumInfo>();

  console.log('DTO 파일 파싱 중...');
  for (const filePath of DTO_FILES) {
    if (!fs.existsSync(filePath)) {
      console.warn(`  경고: 파일 없음 - ${filePath}`);
      continue;
    }
    console.log(`  ${path.basename(filePath)}`);
    const sourceFile = project.addSourceFileAtPath(filePath);

    // 1차: enum 먼저 수집
    const enums = parseEnums(sourceFile);
    for (const e of enums) {
      enumMap.set(e.name, e);
      allEnums.push(e);
    }

    // const 수집
    const consts = parseConsts(sourceFile);
    allConsts.push(...consts);
  }

  // 2차: DTO 파싱 (enum 참조 가능)
  for (const filePath of DTO_FILES) {
    if (!fs.existsSync(filePath)) continue;
    const sourceFile = project.getSourceFile(filePath)!;
    const dtos = parseDtos(sourceFile, enumMap);
    allDtos.push(...dtos);
  }

  console.log(`  -> enum ${allEnums.length}개, DTO ${allDtos.length}개, const ${allConsts.length}개 파싱 완료`);
  console.log('');

  // 컨트롤러 파일 파싱
  const allEndpoints: EndpointInfo[] = [];
  console.log('컨트롤러 파일 파싱 중...');
  for (const filePath of CONTROLLER_FILES) {
    if (!fs.existsSync(filePath)) {
      console.warn(`  경고: 파일 없음 - ${filePath}`);
      continue;
    }
    console.log(`  ${path.basename(filePath)}`);
    const sourceFile = project.addSourceFileAtPath(filePath);
    const endpoints = parseEndpoints(sourceFile);
    allEndpoints.push(...endpoints);
  }
  console.log(`  -> 엔드포인트 ${allEndpoints.length}개 파싱 완료`);
  console.log('');

  // Python 파일 생성
  const pythonCode = generatePython(allEnums, allDtos, allConsts, allEndpoints);
  for (const outputPath of OUTPUT_PYTHON_PATHS) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      // Python 패키지 __init__.py 생성
      const initPath = path.join(dir, '__init__.py');
      if (!fs.existsSync(initPath)) {
        fs.writeFileSync(initPath, '');
      }
    }
    fs.writeFileSync(outputPath, pythonCode, 'utf-8');
    console.log(`Python 타입 파일 생성: ${outputPath}`);
  }

  // TypeScript 파일 생성
  const tsCode = generateTypeScript(allEnums, allDtos, allConsts, allEndpoints);
  const tsDir = path.dirname(OUTPUT_TS_PATH);
  if (!fs.existsSync(tsDir)) {
    fs.mkdirSync(tsDir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_TS_PATH, tsCode, 'utf-8');
  console.log(`TypeScript 타입 파일 생성: ${OUTPUT_TS_PATH}`);
  console.log('');
  console.log('완료!');
}

main();
