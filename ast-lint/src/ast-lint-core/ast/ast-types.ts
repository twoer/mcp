/**
 * AST 节点类型定义
 * 用于替代 any 类型，提升类型安全性
 */

export interface SourceLocation {
  start?: { line: number; column?: number };
  end?: { line: number; column?: number };
}

export interface BaseASTNode {
  type: string;
  loc?: SourceLocation;
  range?: [number, number];
  leadingComments?: Comment[];
  trailingComments?: Comment[];
  parent?: BaseASTNode;
}

export interface Comment {
  type: 'Line' | 'Block';
  value: string;
  loc?: SourceLocation;
}

export interface Identifier extends BaseASTNode {
  type: 'Identifier';
  name: string;
}

export interface Literal extends BaseASTNode {
  type: 'Literal';
  value: string | number | boolean | null | RegExp;
  raw?: string;
  regex?: { pattern: string; flags: string };
}

export interface FunctionNode extends BaseASTNode {
  type: 'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression';
  id?: Identifier | null;
  params: Array<Identifier | Pattern>;
  body: BlockStatement | Expression;
  async?: boolean;
  generator?: boolean;
}

export interface FunctionDeclaration extends FunctionNode {
  type: 'FunctionDeclaration';
  id: Identifier;
}

export interface FunctionExpression extends FunctionNode {
  type: 'FunctionExpression';
}

export interface ArrowFunctionExpression extends FunctionNode {
  type: 'ArrowFunctionExpression';
  expression?: boolean;
}

export interface BlockStatement extends BaseASTNode {
  type: 'BlockStatement';
  body: Statement[];
}

export interface IfStatement extends BaseASTNode {
  type: 'IfStatement';
  test: Expression;
  consequent: Statement;
  alternate?: Statement | null;
}

export interface ForStatement extends BaseASTNode {
  type: 'ForStatement';
  init?: VariableDeclaration | Expression | null;
  test?: Expression | null;
  update?: Expression | null;
  body: Statement;
}

export interface WhileStatement extends BaseASTNode {
  type: 'WhileStatement';
  test: Expression;
  body: Statement;
}

export interface DoWhileStatement extends BaseASTNode {
  type: 'DoWhileStatement';
  body: Statement;
  test: Expression;
}

export interface SwitchStatement extends BaseASTNode {
  type: 'SwitchStatement';
  discriminant: Expression;
  cases: SwitchCase[];
}

export interface SwitchCase extends BaseASTNode {
  type: 'SwitchCase';
  test?: Expression | null;
  consequent: Statement[];
}

export interface TryStatement extends BaseASTNode {
  type: 'TryStatement';
  block: BlockStatement;
  handler?: CatchClause | null;
  finalizer?: BlockStatement | null;
}

export interface ReturnStatement extends BaseASTNode {
  type: 'ReturnStatement';
  argument?: Expression | null;
}

export interface CatchClause extends BaseASTNode {
  type: 'CatchClause';
  param?: Pattern | null;
  body: BlockStatement;
}

export interface MemberExpression extends BaseASTNode {
  type: 'MemberExpression';
  object: Expression;
  property: Expression | Identifier;
  computed: boolean;
}

export interface CallExpression extends BaseASTNode {
  type: 'CallExpression';
  callee: Expression;
  arguments: Array<Expression | SpreadElement>;
}

export interface NewExpression extends BaseASTNode {
  type: 'NewExpression';
  callee: Expression;
  arguments: Array<Expression | SpreadElement>;
}

export interface VariableDeclaration extends BaseASTNode {
  type: 'VariableDeclaration';
  declarations: VariableDeclarator[];
  kind: 'var' | 'let' | 'const';
}

export interface VariableDeclarator extends BaseASTNode {
  type: 'VariableDeclarator';
  id: Pattern;
  init?: Expression | null;
}

export interface MethodDefinition extends BaseASTNode {
  type: 'MethodDefinition';
  key: Expression | Identifier;
  value: FunctionExpression | FunctionNode;
  kind: 'constructor' | 'method' | 'get' | 'set';
  computed: boolean;
  static?: boolean;
}

export interface Property extends BaseASTNode {
  type: 'Property';
  key: Expression | Identifier | Literal;
  value: Expression;
  kind: 'init' | 'get' | 'set';
  method: boolean;
  shorthand: boolean;
  computed: boolean;
}

export interface BinaryExpression extends BaseASTNode {
  type: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
}

export interface LogicalExpression extends BaseASTNode {
  type: 'LogicalExpression';
  operator: '&&' | '||' | '??';
  left: Expression;
  right: Expression;
}

export interface ConditionalExpression extends BaseASTNode {
  type: 'ConditionalExpression';
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}

export interface TemplateLiteral extends BaseASTNode {
  type: 'TemplateLiteral';
  quasis: TemplateElement[];
  expressions: Expression[];
}

export interface TemplateElement extends BaseASTNode {
  type: 'TemplateElement';
  value: { raw: string; cooked?: string };
  tail: boolean;
}

export interface SpreadElement extends BaseASTNode {
  type: 'SpreadElement';
  argument: Expression;
}

export interface ThisExpression extends BaseASTNode {
  type: 'ThisExpression';
}

export interface AssignmentExpression extends BaseASTNode {
  type: 'AssignmentExpression';
  operator: string;
  left: Expression | MemberExpression;
  right: Expression;
}

export interface ObjectPattern extends BaseASTNode {
  type: 'ObjectPattern';
  properties: Array<Property | RestElement>;
}

export interface RestElement extends BaseASTNode {
  type: 'RestElement';
  argument: Pattern;
}

export interface TSAsExpression extends BaseASTNode {
  type: 'TSAsExpression';
  expression: Expression;
  typeAnnotation: BaseASTNode;
}

export interface TaggedTemplateExpression extends BaseASTNode {
  type: 'TaggedTemplateExpression';
  tag: Expression;
  quasi: TemplateLiteral;
}

// Vue 特有节点类型
export interface VElement extends BaseASTNode {
  type: 'VElement';
  name: VIdentifier;
  startTag: VStartTag;
  endTag?: VEndTag | null;
  children: VNode[];
}

export interface VStartTag extends BaseASTNode {
  type: 'VStartTag';
  attributes: Array<VAttribute | VDirective>;
}

export interface VEndTag extends BaseASTNode {
  type: 'VEndTag';
}

export interface VIdentifier extends BaseASTNode {
  type: 'VIdentifier';
  name: string;
}

export interface VAttribute extends BaseASTNode {
  type: 'VAttribute';
  key: VIdentifier | VDirectiveKey;  // 可以是普通属性或指令
  value?: VLiteral | VExpressionContainer | null;
}

export interface VDirective extends BaseASTNode {
  type: 'VDirective';
  key: VDirectiveKey;
  value?: VExpressionContainer | null;
  parent?: VStartTag;
}

export interface VDirectiveKey extends BaseASTNode {
  type: 'VDirectiveKey';
  name: VIdentifier;  // 精确类型定义
  argument?: VIdentifier | VExpressionContainer | null;
  modifiers?: VIdentifier[];
  rawName?: string;
}

export interface VExpressionContainer extends BaseASTNode {
  type: 'VExpressionContainer';
  expression: Expression | VFilterSequenceExpression | null;
}

export interface VFilterSequenceExpression extends BaseASTNode {
  type: 'VFilterSequenceExpression';
  expression: Expression;
  filters: VFilter[];
}

export interface VFilter extends BaseASTNode {
  type: 'VFilter';
  callee: Identifier;
  arguments: Expression[];
}

export interface VLiteral extends BaseASTNode {
  type: 'VLiteral';
  value: string;
}

// 联合类型
export type Expression =
  | Identifier
  | Literal
  | MemberExpression
  | CallExpression
  | BinaryExpression
  | LogicalExpression
  | ConditionalExpression
  | FunctionExpression
  | ArrowFunctionExpression
  | TemplateLiteral
  | ThisExpression
  | AssignmentExpression
  | TSAsExpression
  | TaggedTemplateExpression
  | ObjectPattern;

export type Statement =
  | BlockStatement
  | IfStatement
  | ForStatement
  | WhileStatement
  | DoWhileStatement
  | SwitchStatement
  | TryStatement
  | VariableDeclaration
  | ReturnStatement
  | Expression;

export type Pattern = Identifier | BaseASTNode;

export type VNode = VElement | BaseASTNode;

export type ASTNode =
  | BaseASTNode
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunctionExpression
  | MethodDefinition
  | Property
  | VariableDeclarator
  | MemberExpression
  | CallExpression
  | Literal
  | VElement
  | VDirective
  | VAttribute;
