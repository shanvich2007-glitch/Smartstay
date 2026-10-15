const API_BASE_URL = window.SMARTSTAY_API_BASE_URL || 'http://localhost:3000/api';

export async function requestApi(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  if (response.status === 204) return null;

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'The request could not be completed.');
  }
  return result;
}

export async function requireRole(role) {
  document.documentElement.style.visibility = 'hidden';
  let user;
  try {
    user = JSON.parse(localStorage.getItem('currentUser') || 'null');
  } catch {
    localStorage.removeItem('currentUser');
  }

  if (!user || user.role !== role) {
    window.location.replace('SmartStay Homepage(HTML).html');
    return null;
  }

  document.documentElement.style.visibility = '';
  return user;
}