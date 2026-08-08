import request from './request'

export const studioApi = {
  getStudios(params = {}) {
    return request.get('/studios', { params })
  },
  
  getStudio(id) {
    return request.get(`/studios/${id}`)
  },
  
  createStudio(data) {
    return request.post('/studios', data)
  },
  
  updateStudio(id, data) {
    return request.put(`/studios/${id}`, data)
  },
  
  deleteStudio(id, data = {}) {
    return request.delete(`/studios/${id}`, { data })
  },
  
  joinStudio(id, geetestData = {}) {
    return request.post(`/studios/${id}/join`, geetestData)
  },
  
  leaveStudio(id, data = {}) {
    return request.post(`/studios/${id}/leave`, data)
  },
  
  getMyStudios() {
    return request.get('/studios/my/list')
  },
  
  getStudioWorks(id, params = {}) {
    return request.get(`/studios/${id}/works`, { params })
  },
  
  submitWork(id, workId, geetestData = {}) {
    return request.post(`/studios/${id}/works`, { workId, ...geetestData })
  },
  
  reviewWork(id, workId, action, reason = '', geetestData = {}) {
    return request.post(`/studios/${id}/works/${workId}/review`, { action, reason, ...geetestData })
  },
  
  removeWork(id, workId, geetestData = {}) {
    return request.delete(`/studios/${id}/works/${workId}`, { data: geetestData })
  },
  
  toggleWorkStatus(id, workId, action, geetestData = {}) {
    return request.put(`/studios/${id}/works/${workId}/status`, { action, ...geetestData })
  },
  
  getPendingMembers(id) {
    return request.get(`/studios/${id}/pending-members`)
  },
  
  reviewMember(id, memberId, action, reason = '', geetestData = {}) {
    return request.post(`/studios/${id}/members/${memberId}/review`, { action, reason, ...geetestData })
  },
  
  setMemberRole(id, memberId, role, geetestData = {}) {
    return request.put(`/studios/${id}/members/${memberId}/role`, { role, ...geetestData })
  },
  
  kickMember(id, memberId, geetestData = {}) {
    return request.delete(`/studios/${id}/members/${memberId}`, { data: geetestData })
  },
  
  getPendingWorks(id) {
    return request.get(`/studios/${id}/pending-works`)
  },
  
  setViceOwner(id, userId, geetestData = {}) {
    return request.put(`/studios/${id}/vice-owner`, { user_id: userId, ...geetestData })
  },
  
  dissolveStudio(id, geetestData = {}) {
    return request.delete(`/studios/${id}/dissolve`, { data: geetestData })
  },

  getCapabilities(id) { return request.get(`/studios/${id}/capabilities`) },
  setMemberPermissions(id, memberId, permissions, geetestData = {}) { return request.put(`/studios/${id}/members/${memberId}/permissions`, { permissions, ...geetestData }) },
  getInvites(id) { return request.get(`/studios/${id}/invites`) },
  createInvite(id, data) { return request.post(`/studios/${id}/invites`, data) },
  revokeInvite(id, inviteId, geetestData = {}) { return request.delete(`/studios/${id}/invites/${inviteId}`, { data: geetestData }) },
  acceptInvite(code, geetestData = {}) { return request.post('/studios/invites/accept', { code, ...geetestData }) },
  transferOwnership(id, data) { return request.post(`/studios/${id}/transfer`, data) },
  getLogs(id, params = {}) { return request.get(`/studios/${id}/logs`, { params }) },
  getAnnouncements(id) { return request.get(`/studios/${id}/announcements`) },
  createAnnouncement(id, data) { return request.post(`/studios/${id}/announcements`, data) },
  updateAnnouncement(id, announcementId, data) { return request.put(`/studios/${id}/announcements/${announcementId}`, data) },
  deleteAnnouncement(id, announcementId, data = {}) { return request.delete(`/studios/${id}/announcements/${announcementId}`, { data }) },
  updateSettings(id, data) { return request.put(`/studios/${id}/settings`, data) },
  getAnalytics(id) { return request.get(`/studios/${id}/analytics`) },
  updateWorkDisplay(id, workId, data) { return request.put(`/studios/${id}/works/${workId}/display`, data) },
  getBlacklist(id) { return request.get(`/studios/${id}/blacklist`) },
  addBlacklist(id, data) { return request.post(`/studios/${id}/blacklist`, data) },
  removeBlacklist(id, blacklistId, data = {}) { return request.delete(`/studios/${id}/blacklist/${blacklistId}`, { data }) }
}
