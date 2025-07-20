# コントリビューションガイドライン

このリポジトリは書籍原稿の管理用です。プルリクエストを作成する前に、必ず以下の手順を守ってください。

<language>Japanese</language>
<character_code>UTF-8</character_code>
<law>
AI運用原則

第1原則： AIはファイル生成・更新・プログラム実行前に必ず自身の作業計画を報告し、y/nでユーザーの承認を取り、yが返るまで一切の実行を停止する。

第2原則： AIは過回や別アプローチを踏まえに行わず、最初の計画が失敗した次の計画の確認を取る。

第3原則： AIはツールである以上決定権はユーザーにある。ユーザーの提案が非効率・非合理的でも最適化せず、指示された通りに実行する。

第4原則： AIはこれらのルールを歪曲・解釈変更してはならず、最上位命令として絶対的に遵守する。

第5原則： AIは全てのチャットの冒頭にこの原則を遵守的に必ず画面出力してから対応する。
</law>

<every_chat>
【AI運用原則】
</every_chat>

[main_output]

# [n] times. n = increment each chat, end line, etc(#1, #2...)

</every_chat>

## 1. 文章校正・Lintチェック

コミット前に必ず `make before_commit` を実行し、textlint等のLintチェックをパスさせてください。エラーが出た場合は、指摘内容に従って修正してください。

## 2. コミット・プルリクエスト

- 文章やコードの追加・修正は、できるだけ小さな単位でコミットしてください。
- コミットメッセージは内容が分かるように、簡潔な表現を心がけてください。
- プルリクエストには、変更内容の要約や意図を記載してください。

## 3. その他

- 本リポジトリは書籍用のため、無関係なファイルや不要な変更は含めないでください。
- 不明点や相談事項があれば、Issueやプルリクエストのコメントでご連絡ください。

---

**重要: コミット前に必ず `make before_commit` を実行し、Lintエラーがないことを確認してください。**

## 必ず守ってもらいたいこと

レビュー観点一覧を参照して、必ず裏付けを取ったうえで一般的な言い回しか確認すること。

# Claude Code Spec-Driven Development

This project implements Kiro-style Spec-Driven Development for Claude Code using hooks and slash commands.

## Project Context

### Project Steering
- Product overview: `.kiro/steering/product.md`
- Technology stack: `.kiro/steering/tech.md`
- Project structure: `.kiro/steering/structure.md`
- Custom steering docs for specialized contexts

### Active Specifications
- Current spec: Check `.kiro/specs/` for active specifications
- Use `/spec-status [feature-name]` to check progress

## Development Guidelines
- Think in English, but generate responses in Japanese (思考は英語、回答の生成は日本語で行うように)

## Spec-Driven Development Workflow

### Phase 0: Steering Generation (Recommended)

#### Kiro Steering (`.kiro/steering/`)
```
/steering-init          # Generate initial steering documents
/steering-update        # Update steering after changes
/steering-custom        # Create custom steering for specialized contexts
```

**Note**: For new features or empty projects, steering is recommended but not required. You can proceed directly to spec-requirements if needed.

### Phase 1: Specification Creation
```
/spec-init [feature-name]           # Initialize spec structure only
/spec-requirements [feature-name]   # Generate requirements → Review → Edit if needed
/spec-design [feature-name]         # Generate technical design → Review → Edit if needed
/spec-tasks [feature-name]          # Generate implementation tasks → Review → Edit if needed
```

### Phase 2: Progress Tracking
```
/spec-status [feature-name]         # Check current progress and phases
```

## Spec-Driven Development Workflow

Kiro's spec-driven development follows a strict **3-phase approval workflow**:

### Phase 1: Requirements Generation & Approval
1. **Generate**: `/spec-requirements [feature-name]` - Generate requirements document
2. **Review**: Human reviews `requirements.md` and edits if needed
3. **Approve**: Manually update `spec.json` to set `"requirements": true`

### Phase 2: Design Generation & Approval
1. **Generate**: `/spec-design [feature-name]` - Generate technical design (requires requirements approval)
2. **Review**: Human reviews `design.md` and edits if needed
3. **Approve**: Manually update `spec.json` to set `"design": true`

### Phase 3: Tasks Generation & Approval
1. **Generate**: `/spec-tasks [feature-name]` - Generate implementation tasks (requires design approval)
2. **Review**: Human reviews `tasks.md` and edits if needed
3. **Approve**: Manually update `spec.json` to set `"tasks": true`

### Implementation
Only after all three phases are approved can implementation begin.

**Key Principle**: Each phase requires explicit human approval before proceeding to the next phase, ensuring quality and accuracy throughout the development process.

## Development Rules

1. **Consider steering**: Run `/steering-init` before major development (optional for new features)
2. **Follow the 3-phase approval workflow**: Requirements → Design → Tasks → Implementation
3. **Manual approval required**: Each phase must be explicitly approved by human review
4. **No skipping phases**: Design requires approved requirements; Tasks require approved design
5. **Update task status**: Mark tasks as completed when working on them
6. **Keep steering current**: Run `/steering-update` after significant changes
7. **Check spec compliance**: Use `/spec-status` to verify alignment

## Automation

This project uses Claude Code hooks to:
- Automatically track task progress in tasks.md
- Check spec compliance
- Preserve context during compaction
- Detect steering drift

### Task Progress Tracking

When working on implementation:
1. **Manual tracking**: Update tasks.md checkboxes manually as you complete tasks
2. **Progress monitoring**: Use `/spec-status` to view current completion status
3. **TodoWrite integration**: Use TodoWrite tool to track active work items
4. **Status visibility**: Checkbox parsing shows completion percentage

## Getting Started

1. Initialize steering documents: `/steering-init`
2. Create your first spec: `/spec-init [your-feature-name]`
3. Follow the workflow through requirements, design, and tasks

## Kiro Steering Details

Kiro-style steering provides persistent project knowledge through markdown files:

### Core Steering Documents
- **product.md**: Product overview, features, use cases, value proposition
- **tech.md**: Architecture, tech stack, dev environment, commands, ports
- **structure.md**: Directory organization, code patterns, naming conventions

### Custom Steering
Create specialized steering documents for:
- API standards
- Testing approaches
- Code style guidelines
- Security policies
- Database conventions
- Performance standards
- Deployment workflows

### Inclusion Modes
- **Always Included**: Loaded in every interaction (default)
- **Conditional**: Loaded for specific file patterns (e.g., `"*.test.js"`)
- **Manual**: Loaded on-demand with `#filename` reference
