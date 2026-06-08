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

  register: ({ email, nickName, password, inviteToken }) =>
    api.post('/auth/register', { email, nickName, password, inviteToken }),

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

//
// Expense API
//

export const expenseService = {
  create: (groupId, data) =>
    api.post(`/groups/${groupId}/expenses`, data),

  getAll: (groupId) =>
    api.get(`/groups/${groupId}/expenses`),

  getOne: (groupId, expenseId) =>
    api.get(`/groups/${groupId}/expenses/${expenseId}`),

  update: (groupId, expenseId, data) =>
    api.put(`/groups/${groupId}/expenses/${expenseId}`, data),

  delete: (groupId, expenseId) =>
    api.delete(`/groups/${groupId}/expenses/${expenseId}`),
};

//
// Payment API
//

export const paymentService = {
  create: (groupId, data) =>
    api.post(`/groups/${groupId}/payments`, data),

  getAll: (groupId) =>
    api.get(`/groups/${groupId}/payments`),

  delete: (groupId, paymentId) =>
    api.delete(`/groups/${groupId}/payments/${paymentId}`),
};

//
// Balance API
//

export const balanceService = {
  getBalances: (groupId) =>
    api.get(`/groups/${groupId}/balances`),
};

//
// Invite API
//

export const inviteService = {
  generateInviteLink: (groupId) =>
    api.post(`/groups/${groupId}/invite-link`),

  validateToken: (token) =>
    api.get(`/invites/${token}`),

  acceptInvite: (token) =>
    api.post(`/invites/${token}/accept`),
};

//
// Collective Expense API
//

export const collectiveExpenseService = {
  create: (groupId, data) =>
    api.post(`/groups/${groupId}/collective-expenses`, data),

  getAll: (groupId) =>
    api.get(`/groups/${groupId}/collective-expenses`),

  getById: (groupId, id) =>
    api.get(`/groups/${groupId}/collective-expenses/${id}`),

  update: (groupId, id, data) =>
    api.put(`/groups/${groupId}/collective-expenses/${id}`, data),

  remove: (groupId, id) =>
    api.delete(`/groups/${groupId}/collective-expenses/${id}`),

  unlock: (groupId, id) =>
    api.post(`/groups/${groupId}/collective-expenses/${id}/unlock`),
};

//
// Individual Item API
//

export const individualItemService = {
  add: (groupId, collectiveExpenseId, data) =>
    api.post(
      `/groups/${groupId}/collective-expenses/${collectiveExpenseId}/items`,
      data
    ),

  update: (groupId, collectiveExpenseId, itemId, data) =>
    api.put(
      `/groups/${groupId}/collective-expenses/${collectiveExpenseId}/items/${itemId}`,
      data
    ),

  delete: (groupId, collectiveExpenseId, itemId) =>
    api.delete(
      `/groups/${groupId}/collective-expenses/${collectiveExpenseId}/items/${itemId}`
    ),
};

export default api;
