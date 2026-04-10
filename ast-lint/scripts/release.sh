#!/bin/bash

# AST Lint MCP Server 发布脚本

set -e

echo "🚀 准备发布 AST Lint MCP Server..."

# 1. 检查是否有未提交的更改
if [[ -n $(git status -s) ]]; then
  echo "⚠️  检测到未提交的更改，请先提交或暂存"
  git status -s
  exit 1
fi

# 2. 运行测试
echo "🧪 运行测试..."
npm run test:integration

# 3. 构建
echo "🔨 构建项目..."
npm run build

# 4. 更新版本号
echo "📝 更新版本号..."
read -p "版本类型 (patch/minor/major): " version_type
npm version $version_type

# 5. 创建 Git tag
version=$(node -p "require('./package.json').version")
git tag -a "v$version" -m "Release v$version"

echo "✅ 准备完成！"
echo ""
echo "下一步："
echo "  1. 推送到 Git: git push && git push --tags"
echo "  2. 发布到内部 npm: npm publish --registry=https://your-registry.com"
echo "  3. 或发布到公开 npm: npm publish"
