import React, { useState, useEffect } from 'react';
import './UserManagement.css';

interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
  is_active: boolean;
}

interface UserManagementProps {
  apiClient: any;
}

export const UserManagement: React.FC<UserManagementProps> = ({ apiClient }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    email: '',
    password: '',
    role: 'user'
  });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({
    role: 'user',
    isActive: true,
    password: ''
  });

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/users');
      setUsers(response);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await apiClient.post('/users', createFormData);
      setShowCreateForm(false);
      setCreateFormData({ email: '', password: '', role: 'user' });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setLoading(true);
      setError(null);
      const updateData: any = {
        role: editFormData.role,
        isActive: editFormData.isActive
      };
      if (editFormData.password) {
        updateData.password = editFormData.password;
      }
      await apiClient.put(`/users/${editingUser.id}`, updateData);
      setEditingUser(null);
      setEditFormData({ role: 'user', isActive: true, password: '' });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to deactivate this user?')) return;

    try {
      setLoading(true);
      setError(null);
      await apiClient.delete(`/users/${userId}`);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to deactivate user');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setEditFormData({
      role: user.role,
      isActive: user.is_active,
      password: ''
    });
  };

  return (
    <div className="user-management">
      <div className="user-management-header">
        <h3>User Management</h3>
        <button
          onClick={() => setShowCreateForm(true)}
          className="create-user-btn"
          disabled={loading}
        >
          Add User
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h4>Create New User</h4>
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label>Email:</label>
                <input
                  type="email"
                  value={createFormData.email}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Password:</label>
                <input
                  type="password"
                  value={createFormData.password}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Role:</label>
                <select
                  value={createFormData.role}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateForm(false)}>Cancel</button>
                <button type="submit" disabled={loading}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="modal-overlay">
          <div className="modal">
            <h4>Edit User: {editingUser.email}</h4>
            <form onSubmit={handleUpdateUser}>
              <div className="form-group">
                <label>Role:</label>
                <select
                  value={editFormData.role}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={editFormData.isActive}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  />
                  Active
                </label>
              </div>
              <div className="form-group">
                <label>New Password (leave empty to keep current):</label>
                <input
                  type="password"
                  value={editFormData.password}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, password: e.target.value }))}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setEditingUser(null)}>Cancel</button>
                <button type="submit" disabled={loading}>Update</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="users-table">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>
                  <span className={`status ${user.is_active ? 'active' : 'inactive'}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Never'}</td>
                <td>
                  <button onClick={() => startEdit(user)} disabled={loading}>Edit</button>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    disabled={loading || user.id === 'current-user-id'} // TODO: get current user ID
                    className="delete-btn"
                  >
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};