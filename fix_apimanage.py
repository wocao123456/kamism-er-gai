import re

# Read ApiManage.tsx
with open('src/pages/admin/ApiManage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add helper function to get auth header
auth_header_code = '''
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};
'''

# Insert after maskMiddle function
content = content.replace(
    "const maskMiddle = (s: string) => {\n", 
    "" + auth_header_code + "const maskMiddle = (s: string) => {\n"
)

# Replace all fetch calls to /api/keys to include auth headers
# Pattern: fetch(`${API_BASE}/api/keys`)
# Replace with: fetch(`${API_BASE}/api/keys`, { headers: getAuthHeaders() })

# 1. fetchKeys
old_fetch = "const r = await fetch(`${API_BASE}/api/keys`);"
new_fetch = "const r = await fetch(`${API_BASE}/api/keys`, { headers: getAuthHeaders() });"
content = content.replace(old_fetch, new_fetch)

# 2. deleteKey
old_delete = "await fetch(`${API_BASE}/api/keys/${id}`, { method: 'DELETE' });"
new_delete = "await fetch(`${API_BASE}/api/keys/${id}`, { method: 'DELETE', headers: getAuthHeaders() });"
content = content.replace(old_delete, new_delete)

# 3. toggleKey
old_toggle = "await fetch(`${API_BASE}/api/keys/${id}/toggle`, { method: 'POST' });"
new_toggle = "await fetch(`${API_BASE}/api/keys/${id}/toggle`, { method: 'POST', headers: getAuthHeaders() });"
content = content.replace(old_toggle, new_toggle)

# 4. saveKey - there are multiple fetch calls
# Find saveKey function and update all fetch calls within it
lines = content.split('\n')
new_lines = []
in_save_key = False
for line in lines:
    if 'const saveKey = async' in line:
        in_save_key = True
    if in_save_key and 'await fetch(' in line and 'Content-Type' in line:
        # Add headers: getAuthHeaders() to existing headers
        line = line.replace(
            "headers: { 'Content-Type': 'application/json' },",
            "headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },"
        )
    new_lines.append(line)
content = '\n'.join(new_lines)

# Write back
with open('src/pages/admin/ApiManage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('ApiManage.tsx updated with auth headers!')
