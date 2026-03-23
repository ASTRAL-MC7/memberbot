const TelegramBot = require('node-telegram-bot-api');
const Database = require('better-sqlite3');
const path = require('path');

// ===================== CONFIG =====================
const TOKEN = process.env.TOKEN;
const ADMIN_ID = 5523761749;
const BOT_USERNAME = process.env.BOT_USERNAME;
const OWNER = '@ulugbek_saparaliyev';

const bot = new TelegramBot(TOKEN, { polling: true });
const db = new Database(path.join(__dirname, 'bot.db'));

// ===================== DATABASE =====================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    first_name TEXT,
    username TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS member_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER,
    inviter_id INTEGER,
    member_id INTEGER,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS groups (
    group_id INTEGER PRIMARY KEY,
    title TEXT,
    force_add_limit INTEGER DEFAULT 0,
    force_add_active INTEGER DEFAULT 0,
    force_text TEXT DEFAULT '',
    force_text_time INTEGER DEFAULT 0,
    linked_channel TEXT DEFAULT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS force_members (
    group_id INTEGER,
    user_id INTEGER,
    inviter_id INTEGER,
    invite_count INTEGER DEFAULT 0,
    PRIMARY KEY (group_id, user_id)
  );
`);

// ===================== HELPERS =====================
function getUser(userId) {
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
}

function saveUser(user) {
  db.prepare(`
    INSERT OR IGNORE INTO users (user_id, first_name, username)
    VALUES (?, ?, ?)
  `).run(user.id, user.first_name, user.username || '');
}

function getGroup(groupId) {
  return db.prepare('SELECT * FROM groups WHERE group_id = ?').get(groupId);
}

function saveGroup(groupId, title) {
  db.prepare(`
    INSERT OR IGNORE INTO groups (group_id, title) VALUES (?, ?)
  `).run(groupId, title);
}

function getMemberCount(groupId, userId) {
  return db.prepare(`
    SELECT COUNT(*) as cnt FROM member_stats
    WHERE group_id = ? AND inviter_id = ?
  `).get(groupId, userId)?.cnt || 0;
}

function getTop10(groupId) {
  return db.prepare(`
    SELECT inviter_id, COUNT(*) as cnt FROM member_stats
    WHERE group_id = ?
    GROUP BY inviter_id
    ORDER BY cnt DESC
    LIMIT 10
  `).all(groupId);
}

async function isAdmin(chatId, userId) {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return ['administrator', 'creator'].includes(member.status);
  } catch {
    return false;
  }
}

async function isBotAdmin(chatId) {
  try {
    const me = await bot.getMe();
    const member = await bot.getChatMember(chatId, me.id);
    return ['administrator', 'creator'].includes(member.status);
  } catch {
    return false;
  }
}

// ===================== ADMIN CHECK TIMER =====================
const adminCheckTimers = {};

async function scheduleAdminCheck(chatId) {
  if (adminCheckTimers[chatId]) return;
  adminCheckTimers[chatId] = setTimeout(async () => {
    const botIsAdmin = await isBotAdmin(chatId);
    if (!botIsAdmin) {
      try {
        await bot.leaveChat(chatId);
      } catch {}
    }
    delete adminCheckTimers[chatId];
  }, 5 * 60 * 1000); // 5 daqiqa
}

// ===================== /start =====================
bot.onText(/\/start/, async (msg) => {
  if (msg.chat.type !== 'private') return;
  saveUser(msg.from);

  const name = msg.from.first_name || 'Foydalanuvchi';
  const text =
    `🤖 Botga xush kelibsiz, *${name}*!\n\n` +
    `📊 Men guruhga kim qancha odam qo'shganligini aytib beruvchi botman.\n\n` +
    `Bot orqali guruhingizga istagancha odam yig'ib olasiz 🎯\n` +
    `Video qo'llanmada ko'rsatilgan usulda botni ishlating.\n\n` +
    `/help — buyrug'i orqali bot buyruqlari haqida ma'lumot oling ☑️\n\n` +
    `⚠️ Botning to'g'ri ishlashi uchun guruhda *ADMIN* huquqini berishingiz kerak!\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🚀 *Bot egasi:* ${OWNER}`;

  await bot.sendMessage(msg.chat.id, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        {
          text: '➕ Guruhga qo\'shish',
          url: `https://t.me/${BOT_USERNAME}?startgroup=true&admin=post_messages+delete_messages+restrict_members+invite_users+pin_messages`
        }
      ]]
    }
  });
});

// ===================== /help =====================
bot.onText(/\/help/, async (msg) => {
  const text =
    `🤖 *Botimizning buyruqlari!*\n\n` +
    `📊 *Statistika:*\n` +
    `/mymembers — 📊 Siz qo'shgan odamlar soni\n` +
    `/yourmembers — 📈 Reply qilingan odamning statistikasi\n` +
    `/top — 🏆 Eng ko'p odam qo'shgan 10 talik\n` +
    `/delson — 🗑 Barcha statistikani tozalash\n` +
    `/clean — 🧹 Reply qilingan foydalanuvchi ma'lumotlarini 0 ga tushirish\n\n` +
    `👥 *Majburiy qo'shish:*\n` +
    `/add 10 — Majburiy qo'shishni yoqish (10 odam)\n` +
    `/add off — O'chirish\n` +
    `/textforce *matn* — Qo'shimcha matn qo'shish\n` +
    `/textforce 0 — Matnni o'chirish\n` +
    `/text_time — Matn avtomatik o'chish vaqti\n` +
    `/deforce — Ma'lumotni tozalash\n` +
    `/plus — Balingizni boshqaga o'tkazish\n` +
    `/priv — Imtiyoz berish\n\n` +
    `🔗 *Majburiy a'zolik:*\n` +
    `/set @kanal — Kanal/guruh ulash\n` +
    `/unlink — Uzish\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Bot egasi:* ${OWNER}`;

  await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ===================== BOT GURUHGA QO'SHILDI =====================
bot.on('my_chat_member', async (msg) => {
  const chat = msg.chat;
  if (!['group', 'supergroup'].includes(chat.type)) return;

  const newStatus = msg.new_chat_member?.status;
  if (!['member', 'administrator'].includes(newStatus)) return;

  saveGroup(chat.id, chat.title);

  const botIsAdmin = await isBotAdmin(chat.id);
  if (!botIsAdmin) {
    await bot.sendMessage(chat.id,
      `👋 Salom! Men *${chat.title}* guruhiga qo'shildim!\n\n` +
      `⚠️ Meni to'liq ishlashim uchun *ADMIN* huquqini berishingiz shart!\n\n` +
      `Admin qilmasangiz *5 daqiqa* ichida guruhdan chiqaman 🚪`,
      { parse_mode: 'Markdown' }
    );
    scheduleAdminCheck(chat.id);
  } else {
    await bot.sendMessage(chat.id,
      `✅ Salom! Men *${chat.title}* guruhiga admin sifatida qo'shildim!\n\n` +
      `📊 Endi guruhga kim qancha odam qo'shganini kuzatib boraman!\n` +
      `ℹ️ /help — buyrug'i orqali barcha buyruqlarni ko'ring 🎯`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ===================== YANGI A'ZO QO'SHILDI =====================
bot.on('new_chat_members', async (msg) => {
  const chat = msg.chat;
  const inviter = msg.from;
  const newMembers = msg.new_chat_members;

  if (!getGroup(chat.id)) saveGroup(chat.id, chat.title);

  const group = getGroup(chat.id);
  if (!group) return;

  for (const member of newMembers) {
    if (member.is_bot) continue;

    // Statistika saqlash
    db.prepare(`
      INSERT OR IGNORE INTO member_stats (group_id, inviter_id, member_id)
      VALUES (?, ?, ?)
    `).run(chat.id, inviter.id, member.id);

    // Force add tekshiruv
    if (group.force_add_active && group.force_add_limit > 0) {
      const userInviteCount = getMemberCount(chat.id, member.id);
      if (userInviteCount < group.force_add_limit) {
        let forceText =
          `👋 Salom, *${member.first_name}*!\n\n` +
          `📢 Bu guruhga kirish uchun *${group.force_add_limit}* ta odam qo'shishingiz kerak!\n` +
          `✅ Hozircha: *${userInviteCount}/${group.force_add_limit}* ta\n\n`;

        if (group.force_text) {
          forceText += `📝 ${group.force_text}\n\n`;
        }

        forceText += `🔗 Guruhga taklif linki bilan do'stlaringizni qo'shing!`;

        const sentMsg = await bot.sendMessage(chat.id, forceText, {
          parse_mode: 'Markdown'
        });

        // Avtomatik o'chirish
        if (group.force_text_time > 0) {
          setTimeout(() => {
            bot.deleteMessage(chat.id, sentMsg.message_id).catch(() => {});
          }, group.force_text_time * 1000);
        }
      }
    }

    // Linked channel tekshiruv
    if (group.linked_channel) {
      try {
        const channelMember = await bot.getChatMember(group.linked_channel, member.id);
        if (['left', 'kicked'].includes(channelMember.status)) {
          await bot.sendMessage(chat.id,
            `⚠️ *${member.first_name}*, avval kanalga obuna bo'ling:\n${group.linked_channel}`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch {}
    }
  }
});

// ===================== /mymembers =====================
bot.onText(/\/mymembers/, async (msg) => {
  if (msg.chat.type === 'private') return;
  const botIsAdmin = await isBotAdmin(msg.chat.id);
  if (!botIsAdmin) {
    return bot.sendMessage(msg.chat.id, '⚠️ Meni to\'liq ishlashim uchun admin qilishingiz shart!');
  }

  const count = getMemberCount(msg.chat.id, msg.from.id);
  await bot.sendMessage(msg.chat.id,
    `📊 *${msg.from.first_name}*, siz bu guruhga *${count}* ta odam qo'shdingiz! 🎯`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /yourmembers =====================
bot.onText(/\/yourmembers/, async (msg) => {
  if (msg.chat.type === 'private') return;
  const botIsAdmin = await isBotAdmin(msg.chat.id);
  if (!botIsAdmin) return bot.sendMessage(msg.chat.id, '⚠️ Meni admin qilishingiz shart!');

  if (!msg.reply_to_message) {
    return bot.sendMessage(msg.chat.id, '📌 Iltimos, biror foydalanuvchining xabariga reply qiling!');
  }

  const target = msg.reply_to_message.from;
  const count = getMemberCount(msg.chat.id, target.id);
  await bot.sendMessage(msg.chat.id,
    `📈 *${target.first_name}* bu guruhga *${count}* ta odam qo'shgan! 🏅`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /top =====================
bot.onText(/\/top/, async (msg) => {
  if (msg.chat.type === 'private') return;
  const botIsAdmin = await isBotAdmin(msg.chat.id);
  if (!botIsAdmin) return bot.sendMessage(msg.chat.id, '⚠️ Meni admin qilishingiz shart!');

  const top = getTop10(msg.chat.id);
  if (!top.length) return bot.sendMessage(msg.chat.id, '📊 Hali hech kim odam qo\'shmagan!');

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  let text = `🏆 *TOP 10 — Eng ko'p odam qo'shganlar!*\n━━━━━━━━━━━━━━━\n`;

  for (let i = 0; i < top.length; i++) {
    try {
      const member = await bot.getChatMember(msg.chat.id, top[i].inviter_id);
      const name = member.user.first_name || 'Noma\'lum';
      text += `${medals[i]} *${name}* — ${top[i].cnt} ta 👥\n`;
    } catch {
      text += `${medals[i]} ID:${top[i].inviter_id} — ${top[i].cnt} ta 👥\n`;
    }
  }

  text += `━━━━━━━━━━━━━━━\n🚀 Siz ham ro'yxatga kiring!`;
  await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ===================== /delson =====================
bot.onText(/\/delson/, async (msg) => {
  if (msg.chat.type === 'private') return;
  const botIsAdmin = await isBotAdmin(msg.chat.id);
  if (!botIsAdmin) return bot.sendMessage(msg.chat.id, '⚠️ Meni admin qilishingiz shart!');

  const userIsAdmin = await isAdmin(msg.chat.id, msg.from.id);
  if (!userIsAdmin) return bot.sendMessage(msg.chat.id, '🚫 Bu buyruq faqat adminlar uchun!');

  db.prepare('DELETE FROM member_stats WHERE group_id = ?').run(msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    `🗑 *Barcha statistika tozalandi!* Yangi hisob boshlandi 📊`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /clean =====================
bot.onText(/\/clean/, async (msg) => {
  if (msg.chat.type === 'private') return;
  const botIsAdmin = await isBotAdmin(msg.chat.id);
  if (!botIsAdmin) return bot.sendMessage(msg.chat.id, '⚠️ Meni admin qilishingiz shart!');

  const userIsAdmin = await isAdmin(msg.chat.id, msg.from.id);
  if (!userIsAdmin) return bot.sendMessage(msg.chat.id, '🚫 Bu buyruq faqat adminlar uchun!');

  if (!msg.reply_to_message) {
    return bot.sendMessage(msg.chat.id, '📌 Iltimos, foydalanuvchi xabariga reply qiling!');
  }

  const target = msg.reply_to_message.from;
  db.prepare('DELETE FROM member_stats WHERE group_id = ? AND inviter_id = ?')
    .run(msg.chat.id, target.id);
  await bot.sendMessage(msg.chat.id,
    `🧹 *${target.first_name}*ning statistikasi 0 ga tushirildi!`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /add =====================
bot.onText(/\/add(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.type === 'private') return;
  const botIsAdmin = await isBotAdmin(msg.chat.id);
  if (!botIsAdmin) return bot.sendMessage(msg.chat.id, '⚠️ Meni admin qilishingiz shart!');

  const userIsAdmin = await isAdmin(msg.chat.id, msg.from.id);
  if (!userIsAdmin) return bot.sendMessage(msg.chat.id, '🚫 Bu buyruq faqat adminlar uchun!');

  const arg = match[1]?.trim();
  saveGroup(msg.chat.id, msg.chat.title);

  if (!arg) {
    return bot.sendMessage(msg.chat.id,
      `📌 *Ishlatish:*\n/add 10 — 10 odam qo'shishni majburiy qilish\n/add off — o'chirish`,
      { parse_mode: 'Markdown' }
    );
  }

  if (arg === 'off') {
    db.prepare('UPDATE groups SET force_add_active = 0, force_add_limit = 0 WHERE group_id = ?')
      .run(msg.chat.id);
    return bot.sendMessage(msg.chat.id, '✅ Majburiy qo\'shish *o\'chirildi!*', { parse_mode: 'Markdown' });
  }

  const limit = parseInt(arg);
  if (isNaN(limit) || limit < 1) {
    return bot.sendMessage(msg.chat.id, '❌ Noto\'g\'ri raqam!');
  }

  db.prepare('UPDATE groups SET force_add_active = 1, force_add_limit = ? WHERE group_id = ?')
    .run(limit, msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    `✅ Majburiy qo'shish *yoqildi!*\n👥 Har bir yangi a'zo *${limit}* ta odam qo'shishi kerak!`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /textforce =====================
bot.onText(/\/textforce(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.type === 'private') return;
  const userIsAdmin = await isAdmin(msg.chat.id, msg.from.id);
  if (!userIsAdmin) return bot.sendMessage(msg.chat.id, '🚫 Bu buyruq faqat adminlar uchun!');

  const arg = match[1]?.trim();
  if (!arg) return bot.sendMessage(msg.chat.id, '📌 Namuna: /textforce *Salom do\'stlar!*');

  if (arg === '0') {
    db.prepare('UPDATE groups SET force_text = \'\' WHERE group_id = ?').run(msg.chat.id);
    return bot.sendMessage(msg.chat.id, '✅ Majburiy qo\'shish matni *o\'chirildi!*', { parse_mode: 'Markdown' });
  }

  db.prepare('UPDATE groups SET force_text = ? WHERE group_id = ?').run(arg, msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    `✅ Qo'shimcha matn saqlandi:\n📝 _${arg}_`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /text_time =====================
bot.onText(/\/text_time(?:\s+(\d+))?/, async (msg, match) => {
  if (msg.chat.type === 'private') return;
  const userIsAdmin = await isAdmin(msg.chat.id, msg.from.id);
  if (!userIsAdmin) return bot.sendMessage(msg.chat.id, '🚫 Bu buyruq faqat adminlar uchun!');

  if (!match[1]) {
    return bot.sendMessage(msg.chat.id, '📌 Namuna: /text_time 30 (30 soniyadan keyin o\'chadi)');
  }

  const seconds = parseInt(match[1]);
  db.prepare('UPDATE groups SET force_text_time = ? WHERE group_id = ?').run(seconds, msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    `✅ Matn *${seconds}* soniyadan keyin avtomatik o'chiriladi!`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /deforce =====================
bot.onText(/\/deforce(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.type === 'private') return;
  const userIsAdmin = await isAdmin(msg.chat.id, msg.from.id);
  if (!userIsAdmin) return bot.sendMessage(msg.chat.id, '🚫 Bu buyruq faqat adminlar uchun!');

  let targetId;
  if (msg.reply_to_message) {
    targetId = msg.reply_to_message.from.id;
  } else if (match[1]) {
    targetId = parseInt(match[1]);
  } else {
    return bot.sendMessage(msg.chat.id, '📌 Reply qiling yoki ID kiriting: /deforce 12345');
  }

  db.prepare('DELETE FROM member_stats WHERE group_id = ? AND inviter_id = ?')
    .run(msg.chat.id, targetId);
  await bot.sendMessage(msg.chat.id,
    `🗑 ID *${targetId}* ning force ma'lumotlari tozalandi!`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /plus =====================
bot.onText(/\/plus(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.type === 'private') return;
  const botIsAdmin = await isBotAdmin(msg.chat.id);
  if (!botIsAdmin) return bot.sendMessage(msg.chat.id, '⚠️ Meni admin qilishingiz shart!');

  let targetId;
  if (msg.reply_to_message) {
    targetId = msg.reply_to_message.from.id;
  } else if (match[1]) {
    targetId = parseInt(match[1]);
  } else {
    return bot.sendMessage(msg.chat.id, '📌 Reply qiling yoki ID kiriting!');
  }

  const myCount = getMemberCount(msg.chat.id, msg.from.id);
  if (myCount === 0) return bot.sendMessage(msg.chat.id, '❌ Sizda o\'tkazish uchun bal yo\'q!');

  db.prepare('UPDATE member_stats SET inviter_id = ? WHERE group_id = ? AND inviter_id = ?')
    .run(targetId, msg.chat.id, msg.from.id);

  await bot.sendMessage(msg.chat.id,
    `✅ *${msg.from.first_name}*ning *${myCount}* ta bali ID *${targetId}* ga o'tkazildi! 🎁`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /priv =====================
bot.onText(/\/priv(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.type === 'private') return;
  const userIsAdmin = await isAdmin(msg.chat.id, msg.from.id);
  if (!userIsAdmin) return bot.sendMessage(msg.chat.id, '🚫 Bu buyruq faqat adminlar uchun!');

  let targetId;
  if (msg.reply_to_message) {
    targetId = msg.reply_to_message.from.id;
  } else if (match[1]) {
    targetId = parseInt(match[1]);
  } else {
    return bot.sendMessage(msg.chat.id, '📌 Reply qiling yoki ID kiriting!');
  }

  await bot.sendMessage(msg.chat.id,
    `✅ ID *${targetId}* ga imtiyoz berildi! 🌟`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /set =====================
bot.onText(/\/set(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.type === 'private') return;
  const userIsAdmin = await isAdmin(msg.chat.id, msg.from.id);
  if (!userIsAdmin) return bot.sendMessage(msg.chat.id, '🚫 Bu buyruq faqat adminlar uchun!');

  const channel = match[1]?.trim();
  if (!channel) {
    return bot.sendMessage(msg.chat.id, '📌 Namuna: /set @kanalim');
  }

  db.prepare('UPDATE groups SET linked_channel = ? WHERE group_id = ?')
    .run(channel, msg.chat.id);

  await bot.sendMessage(msg.chat.id,
    `✅ *${channel}* kanali ulandi!\n\n` +
    `⚠️ Botni *${channel}* kanaliga ham *ADMIN* sifatida qo'shishingiz zarur!\n` +
    `Aks holda majburiy a'zolik tizimi ishlamaydi! 🔗`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== /unlink =====================
bot.onText(/\/unlink/, async (msg) => {
  if (msg.chat.type === 'private') return;
  const userIsAdmin = await isAdmin(msg.chat.id, msg.from.id);
  if (!userIsAdmin) return bot.sendMessage(msg.chat.id, '🚫 Bu buyruq faqat adminlar uchun!');

  db.prepare('UPDATE groups SET linked_channel = NULL WHERE group_id = ?').run(msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    `✅ Ulangan kanal *o'chirib tashlandi!* 🔓`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== ADMIN PANEL =====================

// /obuna
bot.onText(/\/obuna/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  const count = db.prepare('SELECT COUNT(*) as cnt FROM users').get()?.cnt || 0;
  await bot.sendMessage(msg.chat.id,
    `📊 *Admin Panel — Statistika*\n\n` +
    `👥 Bot foydalanuvchilari: *${count}* ta\n\n` +
    `🚀 Bot ishlayapti va yangi foydalanuvchilar kutilmoqda!`,
    { parse_mode: 'Markdown' }
  );
});

// /xabar
bot.onText(/\/xabar(?:\s+(.+))?/s, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;

  const message = match[1]?.trim();
  if (!message) {
    return bot.sendMessage(msg.chat.id, '📌 Namuna: /xabar Salom barchaga!');
  }

  const users = db.prepare('SELECT user_id FROM users').all();
  let sent = 0, failed = 0;

  await bot.sendMessage(msg.chat.id,
    `📤 *${users.length}* ta foydalanuvchiga xabar yuborilmoqda...`,
    { parse_mode: 'Markdown' }
  );

  for (const user of users) {
    try {
      await bot.sendMessage(user.user_id,
        `📢 *Admin xabari:*\n\n${message}`,
        { parse_mode: 'Markdown' }
      );
      sent++;
      await new Promise(r => setTimeout(r, 50)); // Rate limit
    } catch {
      failed++;
    }
  }

  await bot.sendMessage(msg.chat.id,
    `✅ *Xabar yuborish yakunlandi!*\n\n` +
    `📨 Yuborildi: *${sent}* ta\n` +
    `❌ Xato: *${failed}* ta`,
    { parse_mode: 'Markdown' }
  );
});

// ===================== ERROR HANDLER =====================
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

console.log('🤖 Bot ishga tushdi! @' + BOT_USERNAME);
