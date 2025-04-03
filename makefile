.PHONY: install build watch test deploy diff synth clean bootstrap

# Variables
AWS_REGION ?= eu-central-1
CDK = npx cdk

# Install dependencies
install:
	npm install

# Build the TypeScript project
build:
	npm run build

# Watch for changes and recompile
watch:
	npm run watch

# Run tests
test:
	npm run test

# Deploy the stack
deploy:
	$(CDK) deploy --all --require-approval never

# Show differences between deployed stack and current state
diff:
	$(CDK) diff

# Synthesize CloudFormation template
synth:
	$(CDK) synth

# Clean build artifacts
clean:
	rm -rf cdk.out
	rm -rf node_modules
	rm -rf dist

# Bootstrap CDK (run this once per account/region)
bootstrap:
	$(CDK) bootstrap aws://$(AWS_ACCOUNT_ID)/$(AWS_REGION)

# List all stacks in the app
list-stacks:
	$(CDK) list

# Combined tasks
all: install build test

# Help target
help:
	@echo "Available targets:"
	@echo "  install      - Install project dependencies"
	@echo "  build       - Compile TypeScript to JavaScript"
	@echo "  watch       - Watch for changes and recompile"
	@echo "  test        - Run test suite"
	@echo "  deploy      - Deploy stack to AWS"
	@echo "  diff        - Show changes to be deployed"
	@echo "  synth       - Synthesize CloudFormation template"
	@echo "  clean       - Remove build artifacts"
	@echo "  bootstrap   - Bootstrap CDK in your AWS account/region"
	@echo "  list-stacks - List all stacks in the app"
	@echo "  all         - Run install, build, and test"
