const { Sequelize, DataTypes, Op } = require('sequelize');
const config = require('./config');

function memoryDatabase() {
  const state = { users: [], conversations: [], members: [], messages: [], groups: [], images: [], audits: [], reports: [], ids: { conversation: 0, message: 0, image: 0, audit: 0, report: 0 } };
  const row = value => Object.assign(value, {
    toJSON() { const plain = { ...this }; delete plain.toJSON; delete plain.save; return plain; },
    async save() { this.updated_at = new Date(); return this; }
  });
  const now = () => ({ created_at: new Date(), updated_at: new Date() });
  const symbols = value => value && typeof value === 'object' ? Object.getOwnPropertySymbols(value) : [];
  const compare = (actual, expected) => {
    if (expected && typeof expected === 'object') {
      for (const symbol of symbols(expected)) {
        if (symbol === Op.in && !expected[symbol].map(String).includes(String(actual))) return false;
        if (symbol === Op.gt && !(Number(actual) > Number(expected[symbol]))) return false;
        if (symbol === Op.gte && !(new Date(actual).getTime() >= new Date(expected[symbol]).getTime())) return false;
        if (symbol === Op.like) {
          const needle = String(expected[symbol]).replace(/^%|%$/g, '').toLowerCase();
          if (!String(actual || '').toLowerCase().includes(needle)) return false;
        }
      }
      return true;
    }
    return String(actual) === String(expected);
  };
  const matches = (item, where = {}) => Object.entries(where).every(([key, expected]) => compare(item[key], expected));
  const select = (list, options = {}) => {
    let result = list.filter(item => matches(item, options.where));
    for (const [field, direction] of options.order || []) result.sort((a, b) => (a[field] > b[field] ? 1 : -1) * (direction === 'DESC' ? -1 : 1));
    return result.slice(0, options.limit || result.length);
  };
  const Conversation = {
    async findAll(options) { return select(state.conversations, options); },
    async count(options) { return select(state.conversations, options).length; },
    async findByPk(id) { return state.conversations.find(item => String(item.id) === String(id)) || null; },
    async findOrCreate({ where, defaults }) { let item = state.conversations.find(value => matches(value, where)); if (item) return [item, false]; item = row({ id: ++state.ids.conversation, last_sequence: 0, ...defaults, ...where, ...now() }); state.conversations.push(item); return [item, true]; },
    async create(data) { const item = row({ id: ++state.ids.conversation, last_sequence: 0, ...data, ...now() }); state.conversations.push(item); return item; }
  };
  const UserProfile = {
    async findAll(options) { return select(state.users, options); },
    async count(options) { return select(state.users, options).length; },
    async findByPk(id) { return state.users.find(item => String(item.id) === String(id)) || null; },
    async upsert(data) {
      let item = state.users.find(value => String(value.id) === String(data.id));
      if (item) Object.assign(item, data, { updated_at: new Date() });
      else { item = row({ ...data, ...now() }); state.users.push(item); }
      return [item, !state.users.includes(item)];
    }
  };
  const ConversationMember = {
    async findAll(options) { return select(state.members, options); },
    async count(options) { return select(state.members, options).length; },
    async findOne({ where }) { return state.members.find(item => matches(item, where)) || null; },
    async findOrCreate({ where, defaults }) { let item = state.members.find(value => matches(value, where)); if (item) return [item, false]; item = row({ ...defaults, ...where, ...now() }); state.members.push(item); return [item, true]; },
    async create(data) { const item = row({ ...data, ...now() }); state.members.push(item); return item; },
    async update(data, options = {}) { let count = 0; for (const item of state.members) { if (matches(item, options.where)) { Object.assign(item, data, { updated_at: new Date() }); count++; } } return [count]; },
    async destroy(options = {}) { const before = state.members.length; state.members = state.members.filter(item => !matches(item, options.where)); return [before - state.members.length]; }
  };
  const Message = {
    async findAll(options) { return select(state.messages, options); },
    async count(options) { return select(state.messages, options).length; },
    async findOne({ where }) { return state.messages.find(item => matches(item, where)) || null; },
    async create(data) { const item = row({ id: ++state.ids.message, status: 'active', ...data, ...now() }); state.messages.push(item); return item; }
  };
  const Group = {
    async findAll(options) { return select(state.groups, options); },
    async count(options) { return select(state.groups, options).length; },
    async findOne({ where }) { return state.groups.find(item => matches(item, where)) || null; },
    async create(data) { const item = row({ member_limit: config.groupDefaultLimit, ...data, ...now() }); state.groups.push(item); return item; },
    async destroy(options = {}) { const before = state.groups.length; state.groups = state.groups.filter(item => !matches(item, options.where)); return [before - state.groups.length]; }
  };
  const Image = {
    async findOne({ where }) { return state.images.find(item => matches(item, where)) || null; },
    async create(data) { const item = row({ id: ++state.ids.image, status: 'ready', ...data, ...now() }); state.images.push(item); return item; }
  };
  const AdminAudit = {
    async findAll(options) { return select(state.audits, options); },
    async count(options) { return select(state.audits, options).length; },
    async create(data) { const item = row({ id: ++state.ids.audit, ...data, ...now() }); state.audits.push(item); return item; }
  };
  const Report = {
    async findAll(options) { return select(state.reports, options); },
    async count(options) { return select(state.reports, options).length; },
    async findOne({ where }) { return state.reports.find(item => matches(item, where)) || null; },
    async create(data) { const item = row({ id: ++state.ids.report, status: 'pending', ...data, ...now() }); state.reports.push(item); return item; }
  };
  const sequelize = {
    async authenticate() {}, async sync() {}, async close() {},
    async transaction(callback) { return callback({ LOCK: { UPDATE: 'UPDATE' } }); }
  };
  return { sequelize, UserProfile, Conversation, ConversationMember, Message, Group, Image, AdminAudit, Report, async connectDatabase() {} };
}

function mysqlDatabase() {
  const sequelize = new Sequelize(config.databaseUrl, { logging: false, pool: { max: 40, min: 2, idle: 10000 } });
  const opts = { underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' };
  const UserProfile = sequelize.define('ImUserProfile', {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    username: { type: DataTypes.STRING(100), allowNull: false },
    nickname: { type: DataTypes.STRING(100) },
    avatar: { type: DataTypes.STRING(1000) },
    codemao_user_id: { type: DataTypes.STRING(40) },
    role: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'user' }
  }, { ...opts, tableName: 'im_user_profiles' });
  const Conversation = sequelize.define('ImConversation', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.ENUM('direct', 'group'), allowNull: false }, direct_key: { type: DataTypes.STRING(64), unique: true },
    last_sequence: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }
  }, { ...opts, tableName: 'im_conversations' });
  const ConversationMember = sequelize.define('ImConversationMember', {
    conversation_id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true }, user_id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    role: { type: DataTypes.ENUM('owner', 'admin', 'member'), allowNull: false, defaultValue: 'member' },
    state: { type: DataTypes.ENUM('active', 'pending', 'left', 'removed', 'banned'), allowNull: false, defaultValue: 'active' }
  }, { ...opts, tableName: 'im_conversation_members', indexes: [{ fields: ['user_id', 'state'] }] });
  const Message = sequelize.define('ImMessage', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true }, conversation_id: { type: DataTypes.BIGINT, allowNull: false },
    sequence: { type: DataTypes.BIGINT, allowNull: false }, sender_id: { type: DataTypes.INTEGER, allowNull: false },
    client_message_id: { type: DataTypes.STRING(64), allowNull: false }, type: { type: DataTypes.ENUM('text', 'image', 'system'), allowNull: false, defaultValue: 'text' },
    content: { type: DataTypes.TEXT, allowNull: false }, status: { type: DataTypes.ENUM('active', 'edited', 'recalled', 'hidden'), allowNull: false, defaultValue: 'active' }
  }, { ...opts, tableName: 'im_messages', indexes: [
    { unique: true, fields: ['conversation_id', 'sequence'] }, { unique: true, fields: ['sender_id', 'client_message_id'] }, { fields: ['conversation_id', 'created_at'] }
  ] });
  const Group = sequelize.define('ImGroup', {
    conversation_id: { type: DataTypes.BIGINT, primaryKey: true }, name: { type: DataTypes.STRING(50), allowNull: false },
    owner_id: { type: DataTypes.INTEGER, allowNull: false }, member_limit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: config.groupDefaultLimit }
  }, { ...opts, tableName: 'im_groups', indexes: [{ fields: ['owner_id'] }] });
  const Image = sequelize.define('ImImage', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true }, user_id: { type: DataTypes.INTEGER, allowNull: false },
    url: { type: DataTypes.STRING(1000), allowNull: false }, mime: { type: DataTypes.STRING(40), allowNull: false }, size: { type: DataTypes.INTEGER, allowNull: false },
    sha256: { type: DataTypes.STRING(64), allowNull: false }, status: { type: DataTypes.ENUM('ready', 'used', 'blocked'), allowNull: false, defaultValue: 'ready' }
  }, { ...opts, tableName: 'im_images', indexes: [{ fields: ['user_id', 'status', 'created_at'] }] });
  const AdminAudit = sequelize.define('ImAdminAudit', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true }, admin_id: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.STRING(80), allowNull: false }, reason: { type: DataTypes.STRING(500), allowNull: false },
    filters: { type: DataTypes.JSON }, source_ip: { type: DataTypes.STRING(64) }
  }, { ...opts, tableName: 'im_admin_audits', updatedAt: false, indexes: [{ fields: ['admin_id', 'created_at'] }, { fields: ['action', 'created_at'] }] });
  const Report = sequelize.define('ImReport', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true }, reporter_id: { type: DataTypes.INTEGER, allowNull: false },
    message_id: { type: DataTypes.BIGINT, allowNull: false }, conversation_id: { type: DataTypes.BIGINT, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false }, status: { type: DataTypes.ENUM('pending', 'resolved', 'rejected'), allowNull: false, defaultValue: 'pending' },
    resolution_reason: { type: DataTypes.STRING(500) }, resolution_action: { type: DataTypes.STRING(40) },
    resolved_by: { type: DataTypes.INTEGER }, resolved_at: { type: DataTypes.DATE }
  }, { ...opts, tableName: 'im_reports', indexes: [{ unique: true, fields: ['reporter_id', 'message_id'] }, { fields: ['status', 'created_at'] }] });
  const SchemaMigration = sequelize.define('ImSchemaMigration', {
    version: { type: DataTypes.STRING(40), primaryKey: true }, checksum: { type: DataTypes.STRING(64), allowNull: false }
  }, { ...opts, tableName: 'im_schema_migrations', updatedAt: false });
  return { sequelize, UserProfile, Conversation, ConversationMember, Message, Group, Image, AdminAudit, Report, async connectDatabase() {
    await sequelize.authenticate();
    await SchemaMigration.sync();
    const version = '001_initial_im_schema';
    if (!await SchemaMigration.findByPk(version)) {
      for (const model of [Conversation, ConversationMember, Message, Group, AdminAudit]) await model.sync();
      await SchemaMigration.create({ version, checksum: 'conversations-members-messages-groups-audits-v1' });
    }
    const imageVersion = '002_image_host_metadata';
    if (!await SchemaMigration.findByPk(imageVersion)) {
      await Image.sync();
      await SchemaMigration.create({ version: imageVersion, checksum: 'image-url-mime-size-sha-status-v1' });
    }
    const noReceiptsVersion = '003_remove_read_receipts';
    if (!await SchemaMigration.findByPk(noReceiptsVersion)) {
      const columns = await sequelize.getQueryInterface().describeTable('im_conversation_members');
      if (columns.last_read_sequence) await sequelize.getQueryInterface().removeColumn('im_conversation_members', 'last_read_sequence');
      await SchemaMigration.create({ version: noReceiptsVersion, checksum: 'remove-last-read-sequence-v1' });
    }
    const reportsVersion = '004_im_reports';
    if (!await SchemaMigration.findByPk(reportsVersion)) {
      await Report.sync();
      await SchemaMigration.create({ version: reportsVersion, checksum: 'im-message-reports-v1' });
    }
    const userProfilesVersion = '005_im_user_profiles';
    if (!await SchemaMigration.findByPk(userProfilesVersion)) {
      await UserProfile.sync();
      await SchemaMigration.create({ version: userProfilesVersion, checksum: 'im-sso-user-profile-cache-v1' });
    }
    const codemaoProfileVersion = '006_im_profile_codemao_id';
    if (!await SchemaMigration.findByPk(codemaoProfileVersion)) {
      const columns = await sequelize.getQueryInterface().describeTable('im_user_profiles');
      if (!columns.codemao_user_id) await sequelize.getQueryInterface().addColumn('im_user_profiles', 'codemao_user_id', { type: DataTypes.STRING(40) });
      await SchemaMigration.create({ version: codemaoProfileVersion, checksum: 'im-profile-codemao-user-id-v1' });
    }
    const reportResolutionVersion = '007_im_report_resolution';
    if (!await SchemaMigration.findByPk(reportResolutionVersion)) {
      const columns = await sequelize.getQueryInterface().describeTable('im_reports');
      if (!columns.resolution_reason) await sequelize.getQueryInterface().addColumn('im_reports', 'resolution_reason', { type: DataTypes.STRING(500) });
      if (!columns.resolved_by) await sequelize.getQueryInterface().addColumn('im_reports', 'resolved_by', { type: DataTypes.INTEGER });
      if (!columns.resolved_at) await sequelize.getQueryInterface().addColumn('im_reports', 'resolved_at', { type: DataTypes.DATE });
      await SchemaMigration.create({ version: reportResolutionVersion, checksum: 'im-report-resolution-audit-v1' });
    }
    const reportActionsVersion = '008_im_report_actions';
    if (!await SchemaMigration.findByPk(reportActionsVersion)) {
      const columns = await sequelize.getQueryInterface().describeTable('im_reports');
      if (!columns.resolution_action) await sequelize.getQueryInterface().addColumn('im_reports', 'resolution_action', { type: DataTypes.STRING(40) });
      await SchemaMigration.create({ version: reportActionsVersion, checksum: 'im-report-moderation-actions-v1' });
    }
  } };
}

module.exports = config.databaseUrl === 'memory:' ? memoryDatabase() : mysqlDatabase();
