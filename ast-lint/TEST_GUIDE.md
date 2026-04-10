# AST Lint MCP Server 测试指南

**版本：** v1.0.0
**测试日期：** 2026-03-13
**Commit ID：** 95ffdf5

---

## 📦 本次更新内容

### 新增功能（5 个工具）

1. **`get_fix_suggestion`** — 获取修复建议（含 diff 预览）
2. **`ignore_issue`** — 忽略特定问题
3. **`apply_safe_fixes`** — 自动修复（含备份）
4. **`undo_fix`** — 撤销修复
5. **`get_rule_stats`** — 规则统计
6. **`generate_report`** — 生成 Markdown 报告

### 核心改进

- ✅ 所有 37 条规则都有详细的修复建议
- ✅ 所有规则都有参考文档链接
- ✅ 可自动修复率从 58.6% → 75.5%
- ✅ 修复建议质量从 2.3/5 → 4.2/5

---

## 🧪 测试清单

### 测试场景 1: 获取修复建议 ⭐⭐⭐

**目的：** 验证修复建议系统是否正常工作

**测试步骤：**
```typescript
// 1. 创建测试文件
cat > /tmp/test.vue <<'EOF'
<template>
  <div class="h-[731.5px]">test</div>
</template>
EOF

// 2. 获取修复建议
mcp__ast_lint__get_fix_suggestion({
  filePath: "/tmp/test.vue",
  line: 2
})
```

**预期结果：**
```json
{
  "status": "success",
  "issue": {
    "file": "test.vue",
    "line": 2,
    "ruleId": "maintainability/integer-pixel-units",
    "message": "Tailwind 任意值 \"h-[731.5px]\" 使用了小数 px..."
  },
  "fixSuggestion": {
    "title": "将小数像素改为整数",
    "fixType": "safe",
    "autoFix": {
      "before": "h-[731.5px]",
      "after": "h-[732px]"
    }
  },
  "diff": "@@ -2,1 +2,1 @@\n-h-[731.5px]\n+h-[732px]"
}
```

**验证点：**
- [ ] 返回 status: "success"
- [ ] 包含 fixSuggestion 字段
- [ ] fixType 为 "safe"
- [ ] 包含 diff 预览
- [ ] autoFix 有 before/after

---

### 测试场景 2: 自动修复 + 撤销 ⭐⭐⭐

**目的：** 验证自动修复和撤销功能

**测试步骤：**
```typescript
// 1. 创建测试文件
cat > /tmp/test-fix.vue <<'EOF'
<template>
  <div class="h-[731.5px] w-[100.5px]">test</div>
</template>
EOF

// 2. 查看原始内容
cat /tmp/test-fix.vue

// 3. 应用自动修复
mcp__ast_lint__apply_safe_fixes({
  filePath: "/tmp/test-fix.vue"
})
// 记录返回的 backupId

// 4. 查看修复后内容
cat /tmp/test-fix.vue

// 5. 撤销修复
mcp__ast_lint__undo_fix({
  filePath: "/tmp/test-fix.vue",
  backupId: "<上一步返回的 backupId>"
})

// 6. 查看撤销后内容
cat /tmp/test-fix.vue
```

**预期结果：**
- 步骤 2: `h-[731.5px] w-[100.5px]`
- 步骤 4: `h-[732px] w-[101px]`（修复后）
- 步骤 6: `h-[731.5px] w-[100.5px]`（恢复原样）

**验证点：**
- [ ] apply_safe_fixes 返回 backupId
- [ ] 修复后文件内容正确
- [ ] 备份文件存在于 .ast-lint/backups/
- [ ] 撤销后完全恢复原样

---

### 测试场景 3: 忽略问题 ⭐⭐⭐

**目的：** 验证忽略功能是否生效

**测试步骤：**
```typescript
// 1. 创建测试文件
cat > /tmp/test-ignore.vue <<'EOF'
<template>
  <img src="logo.png">
</template>
EOF

// 2. 分析文件（修复前）
mcp__ast_lint__analyze_file({
  filePath: "/tmp/test-ignore.vue"
})
// 记录问题数量

// 3. 忽略问题
mcp__ast_lint__ignore_issue({
  filePath: "/tmp/test-ignore.vue",
  line: 2,
  ruleId: "accessibility/alt-text-required",
  reason: "装饰性 logo"
})

// 4. 查看文件内容
cat /tmp/test-ignore.vue

// 5. 再次分析文件（修复后）
mcp__ast_lint__analyze_file({
  filePath: "/tmp/test-ignore.vue"
})
// 对比问题数量
```

**预期结果：**
- 步骤 2: 检测到 2 个问题（alt-text-required + missing-lazy-load）
- 步骤 4: 文件中添加了注释 `// ast-lint-disable-next-line accessibility/alt-text-required -- 装饰性 logo`
- 步骤 5: 只检测到 1 个问题（missing-lazy-load），alt-text-required 被忽略

**验证点：**
- [ ] 忽略注释正确添加
- [ ] 被忽略的问题不再报告
- [ ] 其他问题仍然正常检测

---

### 测试场景 4: 规则统计 ⭐⭐

**目的：** 验证统计功能

**测试步骤：**
```typescript
// 1. 使用真实项目目录
mcp__ast_lint__get_rule_stats({
  path: "app/pages",
  groupBy: "rule"
})

// 2. 按文件分组
mcp__ast_lint__get_rule_stats({
  path: "app/pages",
  groupBy: "file"
})

// 3. 按严重度分组
mcp__ast_lint__get_rule_stats({
  path: "app/pages",
  groupBy: "severity"
})

// 4. 按类别分组
mcp__ast_lint__get_rule_stats({
  path: "app/pages",
  groupBy: "category"
})
```

**预期结果：**
- 返回 totalIssues, filesAnalyzed
- stats 字段包含对应的分组统计
- 数据准确，排序正确

**验证点：**
- [ ] 4 种分组方式都正常工作
- [ ] 统计数据准确
- [ ] 百分比计算正确

---

### 测试场景 5: 生成报告 ⭐⭐

**目的：** 验证报告生成功能

**测试步骤：**
```typescript
// 1. 生成报告
mcp__ast_lint__generate_report({
  path: "app/pages"
})

// 2. 查看报告文件
// 报告路径会在返回结果的 outputPath 字段中
```

**预期结果：**
- 生成 Markdown 格式报告
- 报告保存在 .ast-lint/reports/ 目录
- 报告包含：
  - 生成时间
  - 分析路径
  - 文件数量
  - 问题总数
  - 规则排名（TOP 20）
  - 严重度分布

**验证点：**
- [ ] 报告文件成功生成
- [ ] Markdown 格式正确
- [ ] 统计数据准确
- [ ] 可读性良好

---

### 测试场景 6: 修复建议质量 ⭐⭐⭐

**目的：** 验证所有规则都有详细建议

**测试步骤：**
随机抽查 10 个规则，验证修复建议质量

**抽查规则列表：**
1. `maintainability/magic-number` — 应该是 Guided Fix
2. `accessibility/alt-text-required` — 应该是 Suggested Fix
3. `performance/missing-lazy-load` — 应该是 Safe Fix
4. `vue/no-timer-without-cleanup` — 应该是 Guided Fix
5. `security/no-hardcoded-secrets` — 应该是 Manual Fix
6. `maintainability/long-function` — 应该是 Guided Fix
7. `vue/no-v-for-index-as-key` — 应该是 Suggested Fix
8. `performance/no-unnecessary-reactive` — 应该是 Safe Fix
9. `maintainability/prefer-early-return` — 应该是 Guided Fix
10. `vue/button-has-type` — 应该是 Safe Fix

**验证点：**
- [ ] 所有规则都有 fixSuggestion
- [ ] fixType 正确（safe/suggested/guided/manual）
- [ ] Safe Fix 有 autoFix 字段
- [ ] Guided Fix 有 steps 字段
- [ ] 所有规则都有 references 字段
- [ ] 参考文档链接有效

---

### 测试场景 7: 批量分析性能 ⭐

**目的：** 验证大规模分析的性能

**测试步骤：**
```typescript
// 分析 100+ 文件的目录
mcp__ast_lint__analyze_directory({
  path: "app/pages",
  format: "detailed",
  maxFiles: 200
})
```

**预期结果：**
- 分析完成时间 < 30 秒（100 个文件）
- 返回详细的问题列表
- 日志输出进度信息

**验证点：**
- [ ] 性能可接受
- [ ] 不会崩溃或超时
- [ ] 结果准确

---

### 测试场景 8: Git diff 分析 ⭐

**目的：** 验证增量分析功能

**测试步骤：**
```typescript
// 1. 修改一个文件
// 2. 分析变更
mcp__ast_lint__analyze_git_diff({
  base: "HEAD~1",
  onlyChanged: true
})
```

**预期结果：**
- 只报告变更行的问题
- 不报告未修改行的问题

**验证点：**
- [ ] 只检测变更行
- [ ] 结果准确

---

### 测试场景 9: 配置文件 ⭐

**目的：** 验证自定义配置

**测试步骤：**
```typescript
// 1. 创建配置文件
cat > .astlintrc.json <<'EOF'
{
  "rules": {
    "concern": {
      "maintainability": {
        "rules": {
          "integer-pixel-units": {
            "enabled": false
          }
        }
      }
    }
  }
}
EOF

// 2. 分析文件
mcp__ast_lint__analyze_file({
  filePath: "test.vue"
})
```

**预期结果：**
- integer-pixel-units 规则被禁用
- 不报告小数像素问题

**验证点：**
- [ ] 配置文件生效
- [ ] 规则正确禁用

---

## 🐛 已知问题

无

---

## 📊 性能基准

| 操作 | 文件数 | 预期耗时 |
|------|--------|---------|
| analyze_file | 1 | < 100ms |
| analyze_directory | 10 | < 2s |
| analyze_directory | 100 | < 20s |
| apply_safe_fixes | 1 文件 | < 500ms |
| generate_report | 100 文件 | < 25s |

---

## 🔧 测试环境要求

- Node.js >= 18
- 项目包含 Vue 文件
- Git 仓库（用于测试 analyze_git_diff）

---

## 📝 测试报告模板

```markdown
## 测试结果

**测试人员：** [姓名]
**测试日期：** [日期]
**测试环境：** [Node 版本 / OS]

### 场景 1: 获取修复建议
- [ ] ✅ 通过 / ❌ 失败
- 问题描述：

### 场景 2: 自动修复 + 撤销
- [ ] ✅ 通过 / ❌ 失败
- 问题描述：

### 场景 3: 忽略问题
- [ ] ✅ 通过 / ❌ 失败
- 问题描述：

### 场景 4: 规则统计
- [ ] ✅ 通过 / ❌ 失败
- 问题描述：

### 场景 5: 生成报告
- [ ] ✅ 通过 / ❌ 失败
- 问题描述：

### 场景 6: 修复建议质量
- [ ] ✅ 通过 / ❌ 失败
- 问题描述：

### 场景 7: 批量分析性能
- [ ] ✅ 通过 / ❌ 失败
- 实际耗时：
- 问题描述：

### 场景 8: Git diff 分析
- [ ] ✅ 通过 / ❌ 失败
- 问题描述：

### 场景 9: 配置文件
- [ ] ✅ 通过 / ❌ 失败
- 问题描述：

### 总体评价
- 功能完整性：[1-5 分]
- 易用性：[1-5 分]
- 性能：[1-5 分]
- 文档质量：[1-5 分]

### 改进建议
1.
2.
3.
```

---

## 📞 联系方式

**问题反馈：** 发现 bug 或有改进建议，请联系开发团队

---

**祝测试顺利！** 🚀
