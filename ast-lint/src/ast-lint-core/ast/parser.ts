import parser from '@typescript-eslint/parser';
import type { TSESTree } from '@typescript-eslint/types';
import vueParser from 'vue-eslint-parser';

import type { BaseASTNode } from './ast-types.js';

/** TS/JS AST 节点类型 */
export type TSESTreeAST = TSESTree.Program;

/** Vue AST 节点类型 */
export type VueESTreeAST = TSESTree.Program;

/** CSS 虚拟 AST 类型 */
export interface CssVirtualAST {
  type: 'Program';
  body: [];
  sourceType: 'module';
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
  range: [number, number];
  comments: [];
}

/** 统一的 AST 返回类型 */
export type ParsedAST = TSESTreeAST | VueESTreeAST | CssVirtualAST;

/**
 * 解析代码为 AST
 *
 * @param code - 源代码字符串
 * @param isVueFile - 是否为 Vue 文件
 * @param fileType - 文件类型（ts, css, scss, sass, less）
 * @returns 解析后的 AST 节点
 */
export function parseCode(code: string, isVueFile: boolean, fileType: string = 'ts'): ParsedAST {
  if (isVueFile) {
    return vueParser.parse(code, {
      sourceType: 'module',
      ecmaVersion: 2020,
      loc: true,
      range: true,
      comments: true,
    }) as VueESTreeAST;
  }

  if (['css', 'scss', 'sass', 'less'].includes(fileType)) {
    // 对于 CSS 文件，创建一个虚拟的 AST，让规则的 Program:exit 钩子能够执行
    // 实际的 CSS 解析在规则内部使用 PostCSS 完成
    const virtualAst: CssVirtualAST = {
      type: 'Program',
      body: [],
      sourceType: 'module',
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      range: [0, code.length],
      comments: [],
    };
    return virtualAst;
  }

  return parser.parse(code, {
    loc: true,
    range: true,
    comments: true,
    sourceType: 'module',
    ecmaVersion: 2020,
    ecmaFeatures: {
      jsx: true,
    },
  }) as TSESTreeAST;
}

/**
 * 检查 AST 节点是否为 CSS 虚拟 AST
 */
export function isCssVirtualAST(ast: ParsedAST | BaseASTNode): ast is CssVirtualAST {
  return (
    ast.type === 'Program' &&
    'body' in ast &&
    Array.isArray(ast.body) &&
    ast.body.length === 0 &&
    'sourceType' in ast &&
    ast.sourceType === 'module'
  );
}
