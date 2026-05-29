import re

# Read ApiDocs.tsx
with open('src/pages/merchant/ApiDocs.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the style jsx block and replace with regular style tag
new_content = content.replace("<style jsx>{`\n  @media (max-width: 768px) {\n    .api-docs-container {\n      padding: 16px !important;\n    }\n    .api-docs-header {\n      padding: 16px !important;\n      margin-bottom: 16px !important;\n    }\n    .api-docs-tabs {\n      display: flex !important;\n      flex-wrap: wrap !important;\n      gap: 8px !important;\n      margin-bottom: 16px !important;\n    }\n    .api-docs-tab {\n      padding: 8px 16px !important;\n      font-size: 14px !important;\n    }\n    .api-docs-content {\n      display: flex !important;\n      flex-direction: column !important;\n      gap: 16px !important;\n    }\n    .api-docs-card {\n      padding: 16px !important;\n    }\n    .api-docs-pre {\n      font-size: 11px !important;\n      padding: 12px !important;\n      overflow-x: auto !important;\n      white-space: pre-wrap !important;\n    }\n    .api-docs-code-block {\n      margin-bottom: 12px !important;\n    }\n    .api-docs-examples {\n      flex-direction: column !important;\n      gap: 16px !important;\n    }\n  }\n`}</style>

# Rest of the content (skip the original imports)
lines = content.split('\n')
start_idx = 4  # Skip original imports
new_content += '\n'.join(lines[start_idx:])

with open('src/pages/merchant/ApiDocs.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('Fixed ApiDocs.tsx')
