import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
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

  forgotPassword: (email) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token, password) =>
    api.post('/auth/reset-password', { token, password }),
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

  update: (id, data) =>
    api.put(`/groups/${id}`, data),

  delete: (id) =>
    api.delete(`/groups/${id}`),
};

//
// Expense API
//

export const expenseService = {
  create: (groupId, data) =>
    api.post(`/groups/${groupId}/expenses`, data),

  getAll: (groupId, params = {}) =>
    api.get(`/groups/${groupId}/expenses`, { params }),

  getOne: (groupId, expenseId) =>
    api.get(`/groups/${groupId}/expenses/${expenseId}`),

  update: (groupId, expenseId, data) =>
    api.put(`/groups/${groupId}/expenses/${expenseId}`, data),

  delete: (groupId, expenseId) =>
    api.delete(`/groups/${groupId}/expenses/${expenseId}`),

  // Item reporting for COLLECTIVE expenses
  reportItem: (groupId, expenseId, data) =>
    api.post(`/groups/${groupId}/expenses/${expenseId}/items`, data),

  updateItem: (groupId, expenseId, itemId, data) =>
    api.patch(`/groups/${groupId}/expenses/${expenseId}/items/${itemId}`, data),

  deleteItem: (groupId, expenseId, itemId) =>
    api.delete(`/groups/${groupId}/expenses/${expenseId}/items/${itemId}`),

  getItemStatus: (groupId, expenseId) =>
    api.get(`/groups/${groupId}/expenses/${expenseId}/items/status`),

  unlockExpense: (groupId, expenseId) =>
    api.post(`/groups/${groupId}/expenses/${expenseId}/unlock`),
};

//
// Payment API
//

export const paymentService = {
  create: (groupId, data) =>
    api.post(`/groups/${groupId}/payments`, data),

  getAll: (groupId, params = {}) =>
    api.get(`/groups/${groupId}/payments`, { params }),

  delete: (groupId, paymentId) =>
    api.delete(`/groups/${groupId}/payments/${paymentId}`),

  accept: (groupId, paymentId) =>
    api.post(`/groups/${groupId}/payments/${paymentId}/accept`),

  reject: (groupId, paymentId, reason) =>
    api.post(`/groups/${groupId}/payments/${paymentId}/reject`, { reason }),
};

//
// Balance API
//

export const balanceService = {
  getBalances: (groupId) =>
    api.get(`/groups/${groupId}/balances`),
};

//
// Membership API
//

export const membershipService = {
  remove: (groupId, userId) =>
    api.delete(`/groups/${groupId}/members/${userId}`),

  freeze: (groupId, userId) =>
    api.post(`/groups/${groupId}/members/${userId}/freeze`),

  unfreeze: (groupId, userId) =>
    api.post(`/groups/${groupId}/members/${userId}/unfreeze`),

  leave: (groupId) =>
    api.post(`/groups/${groupId}/leave`),
};

//
// Closure API (STATIC groups)
//

export const closureService = {
  start: (groupId) =>
    api.post(`/groups/${groupId}/closure/start`),

  complete: (groupId) =>
    api.post(`/groups/${groupId}/closure/complete`),

  partial: (groupId) =>
    api.post(`/groups/${groupId}/closure/partial`),

  final: (groupId) =>
    api.post(`/groups/${groupId}/closure/final`),
};

//
// Period API (STATIC groups)
//

export const periodService = {
  list: (groupId) =>
    api.get(`/groups/${groupId}/periods`),

  getById: (groupId, periodId) =>
    api.get(`/groups/${groupId}/periods/${periodId}`),

  getBalances: (groupId, periodId) =>
    api.get(`/groups/${groupId}/periods/${periodId}/balances`),

  getExpenses: (groupId, periodId) =>
    api.get(`/groups/${groupId}/periods/${periodId}/expenses`),

  getPayments: (groupId, periodId) =>
    api.get(`/groups/${groupId}/periods/${periodId}/payments`),
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

export default api;
