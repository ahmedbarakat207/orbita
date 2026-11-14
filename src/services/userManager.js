/**
 * ORBITA User & Subject Profile Manager
 * Manages individual astronaut / subject profiles, assigns wearable devices,
 * maintains local storage persistence, and tracks the active monitored user.
 */

export class UserManager {
  constructor(deviceManager, onUpdateCallback) {
    this.deviceManager = deviceManager;
    this.onUpdate = onUpdateCallback;
    this.users = new Map();
    this.activeUserId = null;

    this.loadUsers();
  }

  loadUsers() {
    try {
      const saved = localStorage.getItem('orbita_users');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((u) => this.users.set(u.id, u));
          this.activeUserId = localStorage.getItem('orbita_active_user_id') || parsed[0].id;
          if (!this.users.has(this.activeUserId)) {
            this.activeUserId = parsed[0].id;
          }
          return;
        }
      }
    } catch (_) {}

    // Seed default primary user
    const defaultUser = {
      id: 'user-primary',
      name: 'Ahmed',
      role: 'Mission Commander',
      assignedDeviceId: 'orbita-primary',
      avatarColor: '#38bdf8',
      createdAt: new Date().toISOString()
    };
    this.users.set(defaultUser.id, defaultUser);
    this.activeUserId = defaultUser.id;
    this.saveUsers();
  }

  saveUsers() {
    try {
      const arr = Array.from(this.users.values());
      localStorage.setItem('orbita_users', JSON.stringify(arr));
      if (this.activeUserId) {
        localStorage.setItem('orbita_active_user_id', this.activeUserId);
      }
    } catch (_) {}
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  getActiveUser() {
    return this.users.get(this.activeUserId) || Array.from(this.users.values())[0] || null;
  }

  setActiveUser(id) {
    if (this.users.has(id)) {
      this.activeUserId = id;
      try {
        localStorage.setItem('orbita_active_user_id', id);
      } catch (_) {}
      
      // Also switch active device in deviceManager if user has an assigned device
      const user = this.users.get(id);
      if (user && user.assignedDeviceId) {
        this.deviceManager.setActiveDevice(user.assignedDeviceId);
      }

      if (this.onUpdate) this.onUpdate();
    }
  }

  addUser({ name, role = 'Subject', assignedDeviceId = null, avatarColor = '#38bdf8' }) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return null;

    const id = 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const newUser = {
      id,
      name: trimmedName,
      role: role.trim() || 'Crew Member',
      assignedDeviceId: assignedDeviceId || null,
      avatarColor,
      createdAt: new Date().toISOString()
    };

    this.users.set(id, newUser);
    this.activeUserId = id;
    this.saveUsers();

    if (assignedDeviceId) {
      this.deviceManager.setActiveDevice(assignedDeviceId);
    }

    if (this.onUpdate) this.onUpdate();
    return newUser;
  }

  updateUser(id, updates = {}) {
    const user = this.users.get(id);
    if (!user) return;

    if (updates.name && updates.name.trim()) user.name = updates.name.trim();
    if (updates.role !== undefined) user.role = updates.role.trim();
    if (updates.assignedDeviceId !== undefined) user.assignedDeviceId = updates.assignedDeviceId;
    if (updates.avatarColor) user.avatarColor = updates.avatarColor;

    this.saveUsers();
    if (this.onUpdate) this.onUpdate();
  }

  deleteUser(id) {
    if (this.users.size <= 1) {
      // Don't delete the last remaining user
      return false;
    }
    this.users.delete(id);
    if (this.activeUserId === id) {
      this.activeUserId = Array.from(this.users.keys())[0];
    }
    this.saveUsers();
    if (this.onUpdate) this.onUpdate();
    return true;
  }

  getDeviceForUser(userId) {
    const user = this.users.get(userId);
    if (!user || !user.assignedDeviceId) return null;
    return this.deviceManager.devices.get(user.assignedDeviceId) || null;
  }
}
