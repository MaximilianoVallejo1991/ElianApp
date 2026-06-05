import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:4000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor — extract user-friendly error messages
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const data = error.response.data;
      const message =
        data?.error ||
        data?.message ||
        `Request failed with status ${error.response.status}`;
      const mappedError = new Error(message);
      mappedError.status = error.response.status;
      mappedError.code = data?.code || 'UNKNOWN_ERROR';
      return Promise.reject(mappedError);
    }
    if (error.request) {
      return Promise.reject(
        new Error('Unable to reach the server. Please check your connection.')
      );
    }
    return Promise.reject(error);
  }
);

//
// Auth API
//

export const authService = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  register: (email, nickName, password) =>
    api.post('/auth/register', { email, nickName, password }),

  logout: () =>
    api.post('/auth/logout'),

  getMe: () =>
    api.get('/auth/me'),
};

//
// Groups API
//

export const groupService = {
  getAll: () =>
    api.get('/groups'),

  getById: (id) =>
    api.get(`/groups/${id}`),

  create: (data) =>
    api.post('/groups', data),
};

export default api;
