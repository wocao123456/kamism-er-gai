# Read ApiManage.tsx
with open('src/pages/admin/ApiManage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the getAuthHeaders function with a type-safe version
old_func = '''const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};'''

new_func = '''const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};'''

content = content.replace(old_func, new_func)

# Write back
with open('src/pages/admin/ApiManage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed TypeScript type error in ApiManage.tsx')
