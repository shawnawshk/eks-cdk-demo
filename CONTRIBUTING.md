# Contributing to EKS CDK Demo

Thank you for your interest in contributing to this project! This document provides guidelines for contributing.

## 🚀 Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/eks-cdk-demo.git
   cd eks-cdk-demo
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/shawnawshk/eks-cdk-demo.git
   ```

## 🔧 Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run TypeScript compiler in watch mode**:
   ```bash
   npm run watch
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

## 📝 Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-external-dns` - New features
- `fix/addon-version-mismatch` - Bug fixes
- `docs/update-readme` - Documentation updates
- `refactor/improve-vpc-config` - Code refactoring

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```bash
feat(addons): add Karpenter support
fix(vpc): correct NAT gateway count
docs(readme): update cost estimation
refactor(cluster): simplify node group configuration
```

### Code Style

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused
- Use CDK L2 constructs when available

## 🧪 Testing

Before submitting a PR:

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Run CDK synth** to verify CloudFormation templates:
   ```bash
   npx cdk synth
   ```

3. **Test deployment** (if possible):
   ```bash
   npx cdk deploy --all
   ```

4. **Verify cluster functionality**:
   ```bash
   kubectl get nodes
   kubectl get pods -n kube-system
   ```

## 📤 Submitting Changes

1. **Sync with upstream**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push to your fork**:
   ```bash
   git push origin your-branch-name
   ```

3. **Create a Pull Request** on GitHub with:
   - Clear title describing the change
   - Detailed description of what and why
   - Reference any related issues
   - Screenshots/logs if applicable

### Pull Request Checklist

- [ ] Code follows project style guidelines
- [ ] Commit messages follow Conventional Commits
- [ ] CDK synth passes without errors
- [ ] Documentation updated (if needed)
- [ ] Testing performed (if applicable)
- [ ] No unnecessary files included

## 🐛 Reporting Issues

When reporting bugs, include:

- **Description**: Clear and concise description
- **Steps to reproduce**: Detailed steps
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**:
  - CDK version: `cdk --version`
  - Node.js version: `node --version`
  - AWS region
  - Kubernetes version (if applicable)
- **Logs/Screenshots**: Relevant error messages

## 💡 Feature Requests

For feature requests, provide:

- **Use case**: Why this feature is needed
- **Proposed solution**: How it could work
- **Alternatives considered**: Other approaches
- **Impact**: Who benefits from this feature

## 📚 Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Amazon EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🎯 Areas for Contribution

Looking for ideas? Consider:

- **New addons**: Cert-Manager, External DNS, Velero, etc.
- **Security**: Pod Security Standards, Network Policies
- **Monitoring**: CloudWatch Container Insights, Prometheus
- **Multi-environment**: Dev/Staging/Prod configurations
- **Automation**: GitHub Actions for CI/CD
- **Documentation**: Tutorials, guides, examples
- **Testing**: Unit tests, integration tests

## ❓ Questions?

Feel free to:
- Open an issue for discussion
- Ask in pull request comments
- Check existing issues and PRs

## 📜 Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/0/code_of_conduct/). Please be respectful and constructive in all interactions.

---

Thank you for contributing! 🙌
