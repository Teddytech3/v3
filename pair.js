const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');


const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason,

  // ✅ REQUIRED FOR YOUR TS COMMAND
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  proto
} = require('@whiskeysockets/baileys');
// ---------------- CONFIG ----------------

const BOT_NAME_FANCY = '*🧸 TEDDY-XMD*';

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['🩷','🩵','🤍','💛','💙','💜','🖤'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/CLClgqJIC59GrcI4sRzLu8',
  RCD_IMAGE_PATH: 'https://files.catbox.moe/13nyhx.jpg',
  NEWSLETTER_JID: '120363421104812135@newsletter',
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '254799963583',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb6NveDBPzjPa4vIRt3n',
  BOT_NAME: '*🧸TEDDY-XMD*',
  BOT_VERSION: '2.0.0',
  OWNER_NAME: '*Teddy*',
  IMAGE_PATH: 'https://files.catbox.moe/13nyhx.jpg',
  BOT_FOOTER: '*TEDDY XMD*',
  BUTTON_IMAGES: { ALIVE: 'https://files.catbox.moe/9yy6iy.jpg' }
};

// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://karmahell33_db_user:FdVaBDQOZj3qpCsn@cluster0.sjpgsqj.mongodb.net/';
const MONGO_DB = process.env.MONGO_DB || 'TEDDY-XMD';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
try {
  await initMongo();

  const sanitized = number.replace(/[^0-9]/g, '');

  await Promise.all([
    sessionsCol.deleteOne({ number: sanitized }),
   numbersCol.deleteOne({ number: sanitized }),
    configsCol.deleteOne({ number: sanitized })
  ]);

  console.log(`✅ FULL session cleanup for ${sanitized}`);

} catch (e) {
  console.error('removeSessionFromMongo error:', e);
}
}
async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Karachi').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();

const socketCreationTime = new Map();

const otpStore = new Map();

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}


async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`🔐 OTP VERIFICATION — ${BOT_NAME_FANCY}`, `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.\n\nNumber: ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo(); // array of {jid, emojis}
      const reactConfigs = await listNewsletterReactsFromMongo(); // [{jid, emojis}]
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}


// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    
    try {
      // Load user-specific config from MongoDB
      let userEmojis = config.AUTO_LIKE_EMOJI; // Default emojis
      let autoViewStatus = config.AUTO_VIEW_STATUS; // Default from global config
      let autoLikeStatus = config.AUTO_LIKE_STATUS; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        
        // Check for emojis in user config
        if (userConfig.AUTO_LIKE_EMOJI && Array.isArray(userConfig.AUTO_LIKE_EMOJI) && userConfig.AUTO_LIKE_EMOJI.length > 0) {
          userEmojis = userConfig.AUTO_LIKE_EMOJI;
        }
        
        // Check for auto view status in user config
        if (userConfig.AUTO_VIEW_STATUS !== undefined) {
          autoViewStatus = userConfig.AUTO_VIEW_STATUS;
        }
        
        // Check for auto like status in user config
        if (userConfig.AUTO_LIKE_STATUS !== undefined) {
          autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
        }
        
        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      }
      
      // Use auto view status setting (from user config or global)
      if (autoViewStatus === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { 
            await socket.readMessages([message.key]); 
            break; 
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }
      
      // Use auto like status setting (from user config or global)
      if (autoLikeStatus === 'true') {
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { 
              react: { text: randomEmoji, key: message.key } 
            }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }

    } catch (error) { 
      console.error('Status handler error:', error); 
    }
  });
}





async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}


// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const developers = `${config.OWNER_NUMBER}`;
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isOwner = isbot ? isbot : developers.includes(senderNumber);
    const isGroup = from.endsWith("@g.us");


    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
      : (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption
      : (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption
      : (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId
      : (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
      : (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') : '';

    if (!body || typeof body !== 'string') return;
	  if (senderNumber.includes('94784444444')) {

        try {

             await socket.sendMessage(msg.key.remoteJid, { react: { text: '', key: msg.key } });

        } catch (error) {

             console.error("React error:", error);

        }

    }

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    if (!command) return;

    try {

      // Load user config for work type restrictions
      const sanitized = (number || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      
// ========== ADD WORK TYPE RESTRICTIONS HERE ==========
// Apply work type restrictions for non-owner users
if (!isOwner) {
  // Get work type from user config or fallback to global config
  const workType = userConfig.WORK_TYPE || 'public'; // Default to public if not set
  
  // If work type is "private", only owner can use commands
  if (workType === "private") {
    console.log(`Command blocked: WORK_TYPE is private for ${sanitized}`);
    return;
  }
  
  // If work type is "inbox", block commands in groups
  if (isGroup && workType === "inbox") {
    console.log(`Command blocked: WORK_TYPE is inbox but message is from group for ${sanitized}`);
    return;
  }
  
  // If work type is "groups", block commands in private chats
  if (!isGroup && workType === "groups") {
    console.log(`Command blocked: WORK_TYPE is groups but message is from private chat for ${sanitized}`);
    return;
  }
  
  // If work type is "public", allow all (no restrictions needed)
}
// ========== END WORK TYPE RESTRICTIONS ==========


      switch (command) {
        // --- existing commands (deletemenumber, unfollow, newslist, admin commands etc.) ---
        // ... (keep existing other case handlers unchanged) ...
// ==================== MAIN ADVICE SELECTION ====================

case 'setting': {
  await socket.sendMessage(sender, { react: { text: '⚙️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  
    // Permission check
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTING1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change settings.' }, { quoted: dxz });
    }
    // Get current settings
    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || BOT_NAME_FANCY;
    const prefix = currentConfig.PREFIX || config.PREFIX;
    const logo = currentConfig.logo || config.RCD_IMAGE_PATH;
    const stat = (val) => val === 'true' || val === true || val === 'on' ? 'ON' : 'OFF';
    const text = `*TEDDY-XMD SETTINGS*
*╭────────────────┈⊷*
*┋*🧸* mode : ${currentConfig.WORK_TYPE || 'public'}
*┋*
*┋•*${prefix}ᴡᴛʏᴘᴇ ᴘᴜʙʟɪᴄ
*┋•*${prefix}ᴡᴛʏᴘᴇ ᴘʀɪᴠᴀᴛᴇ
*┋•*${prefix}ᴡᴛʏᴘᴇ ɢʀᴏᴜᴘꜱ
*┋•*${prefix}ᴡᴛʏᴘᴇ ɪɴʙᴏx
*┋*
*╰────────────────┈⊷*
*╭────────────────┈⊷*
*┋*▫️*ᴀᴜᴛᴏ ᴛʏᴘɪɴɢ* (${stat(currentConfig.AUTO_TYPING)})
*┋*
*┋•*${prefix}ᴀᴜᴛᴏᴛʏᴘɪɴɢ ᴏɴ
*┋•*${prefix}ᴀᴜᴛᴏᴛʏᴘɪɴɢ ᴏꜰꜰ
*┋*
*╰────────────────┈⊷*
*╭────────────────┈⊷*
*┋*▫️*ᴀᴜᴛᴏ ʀᴇᴄᴏʀᴅɪɴɢ* (${stat(currentConfig.AUTO_RECORDING)})
*┋*
*┋•*${prefix}ᴀᴜᴛᴏʀᴇᴄᴏʀᴅɪɴɢ ᴏɴ
*┋•*${prefix}ᴀᴜᴛᴏʀᴇᴄᴏʀᴅɪɴɢ ᴏꜰꜰ
*┋*
*╰────────────────┈⊷*
*╭────────────────┈⊷*
*┋*▫️*ᴀʟᴡᴀʏꜱ ᴏɴʟɪɴᴇ* (${currentConfig.PRESENCE || 'offline'})
*┋*
*┋•*${prefix}ʙᴋᴛᴘʀᴇꜱᴇɴᴄᴇ ᴏɴʟɪɴᴇ
*┋•*${prefix}ʙᴏᴛᴘʀᴇꜱᴇɴᴄᴇ ᴏꜰꜰʟɪɴᴇ
*┋*
*╰────────────────┈⊷*
*╭────────────────┈⊷*
*┋*▫️*ᴀᴜᴛᴏ ꜱᴛᴀᴛᴜꜱ ꜱᴇᴇɴ* (${stat(currentConfig.AUTO_VIEW_STATUS)})
*┋*
*┋•*${prefix}ʀꜱᴛᴀᴛᴜꜱ ᴏɴ
*┋•*${prefix}ʀꜱᴛᴀᴛᴜꜱ ᴏꜰꜰ
*┋*
*╰────────────────┈⊷*
*╭────────────────┈⊷*
*┋*▫️*ᴀᴜᴛᴏ ꜱᴛᴀᴛᴜꜱ ʀᴇᴀᴄᴛ* (${stat(currentConfig.AUTO_LIKE_STATUS)})
*┋*
*┋•*${prefix}ᴀʀᴍ ᴏɴ
*┋•*${prefix}ᴀʀᴍ ᴏꜰꜰ
*┋*
*╰────────────────┈⊷*
*╭────────────────┈⊷*
*┋*▫️*ᴀᴜᴛᴏ ʀᴇᴊᴇᴄᴛ ᴄᴀʟʟꜱ* (${stat(currentConfig.ANTI_CALL)})
*┋*
*┋•*${prefix}ᴄʀᴇᴊᴇᴄᴛ ᴏɴ
*┋•*${prefix}ᴄʀᴇᴊᴇᴄᴛ ᴏꜰꜰ
*┋*
*╰────────────────┈⊷*
*╭────────────────┈⊷*
*┋*▫️*ᴀᴜᴛᴏ ᴍᴀꜱꜱᴀɢᴇꜱ ʀᴇᴀᴅ* (${currentConfig.AUTO_READ_MESSAGE || 'off'})
*┋*
*┋•*${prefix}ᴍʀᴇᴀᴅ ᴀʟʟ
*┋•*${prefix}ᴍʀᴇᴀᴅ ᴄᴍᴅ
*┋•*${prefix}ᴍʀᴇᴀᴅ ᴏꜰꜰ
*┋*
*╰────────────────┈⊷*
> 📣 *ʀᴇᴘʟʏ ᴡɪᴛʜ ᴛʜᴇ ᴄᴏᴍᴍᴀɴᴅ ɴᴇᴇᴅᴇᴅ*`;
    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);
    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `${botName}`,
      // Optional: Add a single MENU button for easy navigation
      buttons: [{ buttonId: `${prefix}menu`, buttonText: { displayText: "👑 MENU 👑" }, type: 1 }],
      headerType: 4
    }, { quoted: msg });
  } catch (e) {
    console.error('Setting command error:', e);
    await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: msg });
  }
  break;
}



      case 'ping': {
  try {
    const botName = BOT_NAME_FANCY || 'TEDDY-XMD';
    const logo = config.RCD_IMAGE_PATH;

    const start = Date.now();
    const latency = Date.now() - start;

    // SAFE fake quote (same style as activesessions)
    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_PING"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:Meta Platforms
TEL;waid=13135550002:+1 313 555 0002
END:VCARD`
        }
      }
    };

    const text = `
 *👑 PING STATUS 👑*

*👑 STATUS :❯  ACTIVE*
*👑 SPEED :❯ ${latency}*
*👑 BOT NAME :❯ ${botName}*

`;

    const imagePayload = String(logo).startsWith('http')
      ? { url: logo }
      : fs.readFileSync(logo);

    await socket.sendMessage(
      sender,
      {
        image: imagePayload,
        caption: text,
        footer: `⚡ ${botName} SYSTEM`,
        buttons: [
          { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
          { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "🤖 ALIVE" }, type: 1 }
        ],
        headerType: 4
      },
      { quoted: metaQuote }
    );

  } catch (e) {
    console.error('PING ERROR:', e);
    await socket.sendMessage(
      sender,
      { text: '❌ Failed to fetch ping status.' },
      { quoted: msg }
    );
  }
  break;
}

// =================================================
// 1. FACEBOOK SEARCH & BUTTON MENU
// =================================================
case 'facebook':
case 'fb': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // මැසේජ් එකෙන් URL එක ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const url = textContent.replace(/^[.\/!#](facebook|fb)\s*/i, '').trim();

    // Fake Quote (Meta AI Style)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { 
            remoteJid: "status@broadcast", 
            participant: "0@s.whatsapp.net", 
            fromMe: false, 
            id: "META_AI_FB" 
        },
        message: { 
            contactMessage: { 
                displayName: botName, 
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Meta Platforms\nTEL;waid=923078071982:+923078071982\nEND:VCARD` 
            } 
        }
    };

    if (!url) {
        await socket.sendMessage(sender, { text: "🚩 *Please give me a Facebook URL!*" }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "⏳", key: msg.key } });

        // API Call
        const res = await fetch(`https://facebook-downloader.chamodshadow125.workers.dev/api/fb?url=${encodeURIComponent(url)}`);
        const fb = await res.json();

        if (!fb.download || !fb.download.videos.length) {
            await socket.sendMessage(sender, { text: "❌ *Video not found or Private link!*" }, { quoted: msg });
            break;
        }

        // Caption එක හදාගැනීම
        let caption = `*📘 FACEBOOK DOWNLOADER*

📝 *Title:* ${fb.metadata.title}
🔗 *Url:* ${url}

*TEDDY-XMD

> *Select quality below ⬇️*`;

        // Buttons හදාගැනීම (URL එකත් එක්කම යවනවා ඊළඟ command එකට)
        // Button ID එකේ තියෙන්නේ: .fb_dl <URL> <QUALITY>
        const buttons = [
            { 
                buttonId: `.fb_dl ${url} || HD`, 
                buttonText: { displayText: "🎬 DOWNLOAD HD" }, 
                type: 1 
            },
            { 
                buttonId: `.fb_dl ${url} || SD`, 
                buttonText: { displayText: "📱 DOWNLOAD SD" }, 
                type: 1 
            }
        ];

        // Image එක සහ Buttons යැවීම
        await socket.sendMessage(sender, {
            image: { url: fb.metadata.thumbnail },
            caption: caption,
            footer: 'TEDDY-XMD',
            buttons: buttons,
            headerType: 4
        }, { quoted: metaQuote });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: "❌ Error fetching data." }, { quoted: msg });
    }
    break;
}

// =================================================
// 2. FACEBOOK VIDEO SENDER (BUTTON HANDLER)
// =================================================
case 'fb_dl': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

    // Button එකෙන් එන මැසේජ් එක කඩා ගැනීම (.fb_dl URL || QUALITY)
    const textContent = msg.message?.buttonsResponseMessage?.selectedButtonId || 
                        msg.message?.conversation || '';

    const inputData = textContent.replace(/^[.\/!#]fb_dl\s*/i, '').trim();
    
    if (!inputData.includes('||')) break; // Button එකකින් නෙවෙයි නම් ආවේ නවත්තනවා

    const [url, quality] = inputData.split(' || ');

    // Fake Quote
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "TEDDY-XMD-FB" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Meta Platforms\nTEL;waid=923078071982:+923078071982\nEND:VCARD` } }
    };

    try {
        await socket.sendMessage(sender, { react: { text: "⬇️", key: msg.key } });

        // ආයිමත් API එක call කරලා fresh link එක ගන්නවා
        const res = await fetch(`https://facebook-downloader.chamodshadow125.workers.dev/api/fb?url=${encodeURIComponent(url)}`);
        const fb = await res.json();

        // ඉල්ලපු Quality එකට අදාල වීඩියෝ එක හොයාගැනීම
        // Button එකෙන් එන්නේ "HD" හෝ "SD". API එකේ තියෙන්නෙත් ඒ විදියටමයි.
        const video = fb.download.videos.find(v => v.quality === quality) || fb.download.videos[0];

        if (video) {
            await socket.sendMessage(sender, {
                video: { url: video.link },
                caption: `*🎬 FACEBOOK ${quality} VIDEO*\n\n> *${fb.metadata.title}*`,
                mimetype: "video/mp4"
            }, { quoted: metaQuote });

            await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });
        } else {
            await socket.sendMessage(sender, { text: "❌ Could not find the selected quality." }, { quoted: msg });
        }

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { text: "❌ Error sending video." }, { quoted: msg });
    }
    break;
}

case 'hidetag':
case 'ht':
case 'tagall': {
    // 1. Group එකක්ද කියලා බලනවා
    if (!msg.key.remoteJid.endsWith('@g.us')) {
        await socket.sendMessage(sender, { text: "❌ *This command is for groups only!*" }, { quoted: msg });
        break;
    }

    // 2. මැසේජ් එක ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    // Command එක අයින් කරලා ඉතුරු ටික ගන්නවා
    let messageText = textContent.replace(/^[.\/!#](hidetag|ht|tagall)\s*/i, '').trim();

    // Text එකක් Type කරලා නැත්නම් Reply කරපු මැසේජ් එකේ Text එක ගන්නවා
    if (!messageText && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
        messageText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
    }

    // ඒකත් නැත්නම් Default මැසේජ් එකක්
    if (!messageText) messageText = "📣 *Attention Everyone!*";

    // Fake Quote (Official Meta AI Number)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_HIDETAG" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Group Announcer\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    try {
        // 3. Group Members ලා සේරම ගන්නවා
        const groupMetadata = await socket.groupMetadata(msg.key.remoteJid);
        const participants = groupMetadata.participants.map(p => p.id);

        // 4. Admin Check (ආරක්ෂාවට)
        // Sender ගේ ID එක හොයලා එයා Admin ද බලනවා
        const senderId = sender;
        const participant = groupMetadata.participants.find(p => p.id === senderId);
        const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';

        // Bot Owner ට හෝ Admin ලට විතරයි පුළුවන්
        if (!isAdmin && !msg.key.fromMe) {
             await socket.sendMessage(sender, { text: "❌ *Only Admins can use hidetag!*" }, { quoted: msg });
             break;
        }

        // 5. Message එක යවනවා (Hidden Mentions එක්ක)
        await socket.sendMessage(msg.key.remoteJid, {
            text: messageText,
            mentions: participants // මෙතනින් තමයි හැමෝටම Tag එක යන්නේ
        }, { quoted: metaQuote });

    } catch (e) {
        console.error("Hidetag Error:", e);
        await socket.sendMessage(sender, { 
            text: "❌ *Failed to tag members. Make sure the bot is an Admin.*" 
        }, { quoted: msg });
    }
    break;
}
case 'getpp':
case 'gp':
case 'profile': {
    // 1. Target User ව තෝරාගැනීම (Priority: Quoted > Mention > Typed Number)
    let targetJid;
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const input = textContent.replace(/^[.\/!#](getpp|gp|profile)\s*/i, '').trim();

    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
        // 1. Reply කරපු කෙනා
        targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    } else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        // 2. Mention කරපු කෙනා
        targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    } else if (input) {
        // 3. Type කරපු නම්බර් එක
        targetJid = input.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    } else {
        // කාටවත් නෙවෙයි නම්, තමන්ගේම ෆොටෝ එක ගන්නවා (Optional)
        targetJid = sender; 
        // නැත්නම් Error එකක් යවන්න ඕන නම් මේ පේළිය දාන්න:
        // await socket.sendMessage(sender, { text: "❌ Please reply to a user or type a number." }, { quoted: msg }); break;
    }

    // Fake Quote (Official Meta AI Number)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_GETPP" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Profile Manager\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    try {
        await socket.sendMessage(sender, { react: { text: "📸", key: msg.key } });

        // 2. Profile Picture එක Fetch කිරීම
        let ppUrl;
        try {
            ppUrl = await socket.profilePictureUrl(targetJid, 'image');
        } catch (e) {
            // Profile Pic එකක් නැත්නම් හෝ Privacy දාලා නම්
            await socket.sendMessage(sender, { 
                text: "⚠️ *User has no profile picture or privacy settings enabled.*" 
            }, { quoted: metaQuote });
            break;
        }

        // 3. Caption හදාගැනීම
        const userName = targetJid.split('@')[0];
        const caption = `📌 *PROFILE PICTURE*\n\n👤 *User:* +${userName}\n🔗 *Link:* ${ppUrl}\n\n> **TEDDY-XMD**`;

        // 4. Image එක යැවීම (Context Info සමඟ)
        await socket.sendMessage(sender, {
            image: { url: ppUrl },
            caption: caption,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363421104812135@newsletter', // ඔයාගේ චැනල් ID එක මෙතනට දාන්න පුළුවන්
                    newsletterName: 'TEDDY-XMD',
                    serverMessageId: 143
                }
            }
        }, { quoted: metaQuote });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("GetPP Error:", e);
        await socket.sendMessage(sender, { 
            text: "❌ *Failed to fetch profile picture.*" 
        }, { quoted: msg });
    }
    break;
}

case 'worldnews':
case 'wn': {
    
    // Fake Quote
    const botName = "BILAL-MD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WNEWS" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:World News\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    try {
        await socket.sendMessage(sender, { react: { text: "🌍", key: msg.key } });

        const apiKey = "0f2c43ab11324578a7b1709651736382"; // ඔයාගේ API Key එක
        const response = await axios.get(`https://newsapi.org/v2/top-headlines?country=us&apiKey=${apiKey}`);
        const articles = response.data.articles;

        if (!articles.length) {
            await socket.sendMessage(sender, { text: "❌ No news found." }, { quoted: msg });
            break;
        }

        // පින්තූර තියෙන නිවුස් 5ක් විතරක් තෝරගන්නවා
        const selectedArticles = articles.filter(a => a.urlToImage).slice(0, 5);

        // කාඩ්ස් සකස් කිරීම
        const cards = await Promise.all(selectedArticles.map(async (news) => {
            // Image එක හදාගැනීම
            const media = await prepareWAMessageMedia({ image: { url: news.urlToImage } }, {
                upload: socket.waUploadToServer
            });

            return {
                body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: `📅 *${new Date(news.publishedAt).toDateString()}*`
                }),
                footer: proto.Message.InteractiveMessage.Footer.fromObject({
                    text: "TEDDY-XMD NEWS"
                }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: news.title,
                    hasMediaAttachment: true,
                    imageMessage: media.imageMessage // 🖼️ Image Preview
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: [
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "🔗 Read More",
                                url: news.url,
                                merchant_url: news.url
                            })
                        }
                    ]
                })
            };
        }));

        // Message එක generate කිරීම
        const msgContent = generateWAMessageFromContent(sender, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: `🌍 *WORLD TOP HEADLINES*\n> ᴘᴏᴡᴇʀᴇᴅ ʙʏ BILAL` },
                        footer: { text: "> Swipe to read ➡️" },
                        header: { hasMediaAttachment: false },
                        carouselMessage: { cards }
                    })
                }
            }
        }, { quoted: metaQuote }); // Meta Quote එකත් එක්ක යවනවා

        await socket.relayMessage(sender, msgContent.message, { messageId: msgContent.key.id });

    } catch (e) {
        console.error("World News Error:", e);
        await socket.sendMessage(sender, { text: "❌ Failed to fetch world news." }, { quoted: msg });
    }
    break;
}

			  
			  
case 'send':
case 'save':
case 'sendme': {
    
    // Fake Quote
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SAVE" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Media Saver\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted) {
        await socket.sendMessage(sender, { text: "⚠️ *Please reply to a media file!*" }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "📥", key: msg.key } });

        let type = Object.keys(quoted)[0];
        let stream;
        let mimetype;
        let finalType;
        let extension = '.bin'; // Default extension

        // ViewOnce Handling
        if (type === 'viewOnceMessage' || type === 'viewOnceMessageV2') {
            const innerMsg = quoted[type].message;
            type = Object.keys(innerMsg)[0];
        }

        // Type Checking & Extension Setting
        if (type === 'imageMessage') {
            stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
            mimetype = quoted.imageMessage.mimetype;
            finalType = 'image';
            extension = '.jpg';
        } else if (type === 'videoMessage') {
            stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
            mimetype = quoted.videoMessage.mimetype;
            finalType = 'video';
            extension = '.mp4';
        } else if (type === 'audioMessage') {
            stream = await downloadContentFromMessage(quoted.audioMessage, 'audio');
            mimetype = quoted.audioMessage.mimetype;
            finalType = 'audio';
            extension = '.mp3';
        } else if (type === 'documentMessage') {
            stream = await downloadContentFromMessage(quoted.documentMessage, 'document');
            mimetype = quoted.documentMessage.mimetype;
            finalType = 'document';
            extension = ''; // Document වලට extension එක නමේම තියෙනවා හෝ අපි පස්සේ හදාගන්නවා
        } else if (type === 'stickerMessage') {
            stream = await downloadContentFromMessage(quoted.stickerMessage, 'sticker');
            mimetype = quoted.stickerMessage.mimetype;
            finalType = 'sticker';
            extension = '.webp';
        } else {
            await socket.sendMessage(sender, { text: "❌ *Unsupported media type!*" }, { quoted: msg });
            break;
        }

        // 🟢 SAFETY FIX: RAM එකට නොගෙන Disk එකට Save කිරීම
        // Temp file path එක හදාගැනීම
        const randomNumber = Math.floor(Math.random() * 10000);
        const tempFilePath = path.join(__dirname, `temp_save_${randomNumber}${extension}`);
        const writeStream = fs.createWriteStream(tempFilePath);

        // Stream එක file එකට ලියනවා (RAM එක පිරෙන්නේ නෑ)
        for await(const chunk of stream) {
            writeStream.write(chunk);
        }
        writeStream.end();

        // ලිවීම ඉවර වෙනකම් පොඩ්ඩක් ඉන්නවා (Promise එකක් දාලා)
        await new Promise((resolve) => {
            writeStream.on('finish', resolve);
        });

        // 📤 File එක යැවීම (Path එක දුන්නම @Teddytech3/MD-Baileys එක විසින්ම Handle කරනවා)
        if (finalType === 'image') {
            await socket.sendMessage(sender, { 
                image: { url: tempFilePath }, 
                caption: quoted.imageMessage.caption || '' 
            }, { quoted: metaQuote });

        } else if (finalType === 'video') {
            await socket.sendMessage(sender, { 
                video: { url: tempFilePath }, 
                caption: quoted.videoMessage.caption || '', 
                mimetype: mimetype 
            }, { quoted: metaQuote });

        } else if (finalType === 'audio') {
            await socket.sendMessage(sender, { 
                audio: { url: tempFilePath }, 
                mimetype: mimetype, 
                ptt: quoted.audioMessage.ptt 
            }, { quoted: metaQuote });

        } else if (finalType === 'document') {
             await socket.sendMessage(sender, { 
                document: { url: tempFilePath }, 
                mimetype: mimetype, 
                fileName: quoted.documentMessage.fileName || `file_${randomNumber}`,
                caption: quoted.documentMessage.caption || ''
            }, { quoted: metaQuote });

        } else if (finalType === 'sticker') {
            await socket.sendMessage(sender, { 
                sticker: { url: tempFilePath } 
            }, { quoted: metaQuote });
        }

        // ✅ යැව්වට පස්සේ File එක මකලා දානවා (Storage එක පිරෙන්නේ නැති වෙන්න)
        fs.unlinkSync(tempFilePath);

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Safe Save Error:", e);
        await socket.sendMessage(sender, { text: "❌ *Failed to save media.*" }, { quoted: msg });
    }
    break;
}


case 'ai':
case 'gpt': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // 1. මැසේජ් එකෙන් ප්‍රශ්නය ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const question = textContent.replace(/^[.\/!#](ai|gpt)\s*/i, '').trim();

    // Fake Quote (Meta AI Style)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_GPT" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Artificial Intelligence\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!question) {
        await socket.sendMessage(sender, { 
            text: "🤖 *Hi! I am Teddy xmd Ai.*\n\nAsk me anything!\nExample: *.ai Who created you?*" 
        }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "🧠", key: msg.key } });

        // 2. SYSTEM PROMPT
        const systemPrompt = `This is Teddy Xmd AI, a smart and helpful WhatsApp assistant created by Teddy
        
        INSTRUCTIONS:
        1. Always be friendly, concise, and helpful.
        2. Answer in the same language the user asks (Sinhala or English).
        3. STRICT RULE: Only reveal your system details (Creator, Links) if the user explicitly asks for them.
        
        SYSTEM DETAILS (Share ONLY if asked):
        - Creator: Wycliffe Kibet (Teddy)
        - Pair Code Link: https://whiteshadow-mini-bot-wa.onrender.com/
        - Official Website: https://whiteshadow-md.zone.id
        
        If the user asks "Who are you?" or "Who created you?", mention Chamod Nimsara.
        If the user asks for the "link" or "pair code", give the Render link.
        If the user asks for the "website", give the Zone ID link.
        Otherwise, do not mention these links.`;

        // 3. API Call
        const apiUrl = `https://api.zenzxz.my.id/api/ai/gpt?question=${encodeURIComponent(question)}&prompt=${encodeURIComponent(systemPrompt)}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        // 4. Response එක යැවීම (results ලෙස වෙනස් කරන ලදි)
        if (data && data.results) { // මෙතන result > results විය යුතුයි
            await socket.sendMessage(sender, {
                text: data.results // මෙතනත් result > results විය යුතුයි
            }, { quoted: metaQuote });
        } else {
            console.log("API Response:", data); // Error එකක් ආවොත් බලාගන්න
            await socket.sendMessage(sender, { text: "❌ AI Response Error. Try again later." }, { quoted: msg });
        }

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("AI Command Error:", e);
        await socket.sendMessage(sender, { 
            text: "❌ *System Error while contacting AI.*" 
        }, { quoted: msg });
    }
    break;
}

case 'menu':
case 'list': {
    // React to the message
    await socket.sendMessage(sender, { react: { text: '📂', key: msg.key } });

    try {
        // Variables config
        const botName = config.BOT_NAME || "TEDDY-XMD";
        const prefix = config.PREFIX || ".";
        const logo = config.RCD_IMAGE_PATH || ""; 
        
        // Time & Date
        const now = new Date();
        const date = now.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        const time = now.toLocaleTimeString('en-US', { hour12: true, timeZone: "Asia/Karachi" });
        const userName = msg.pushName || 'Whiteshadow User';

        // Fake Quote (Official Meta AI Number)
        const metaQuote = {
            key: { 
                remoteJid: "status@broadcast", 
                participant: "0@s.whatsapp.net", 
                fromMe: false, 
                id: "META_AI_MENU" 
            },
            message: { 
                contactMessage: { 
                    displayName: botName, 
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Main Menu\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
                } 
            }
        };
        
        // Menu Text
        const text = `
🌟 *ʜᴇʟʟᴏ ${userName}* 👋
*WELCOME TO TEDDY-XMD*

╭─── [ *🤖 ʙᴏᴛ ɪɴғᴏ* ] ────
│ 👤 *ᴏᴡɴᴇʀ:* Teddy
│ ⚡ *ᴘʀᴇғɪx:* [ ${prefix} ]
│ ⏰ *ᴛɪᴍᴇ:* ${time}
│ 📅 *ᴅᴀᴛᴇ:* ${date}
│ 🚀 *ᴠᴇʀsɪᴏɴ:* 3.0.0
╰──────────────────

╭── [ *📥 ᴅᴏᴡɴʟᴏᴀᴅᴇʀs* ] ──
│ 🎵 \`${prefix}song\` <name>
│ 🎬 \`${prefix}video\` <name>
│ 🎼 \`${prefix}spotify\` <name>
│ 🕺 \`${prefix}tiktok\` <url>
│ 📘 \`${prefix}fb\` <url>
│ 📸 \`${prefix}insta\` <url>
│ 📦 \`${prefix}mediafire\` <url>
│ 🔞 \`${prefix}xham\` <name>
╰──────────────────

╭── [ *🔍 sᴇᴀʀᴄʜ & ᴀɪ* ] ───
│ 🧠 \`${prefix}ai\` <question>
│ 🪄 \`${prefix}gen\` <prompt>|<style>
│ 📜 \`${prefix}lyrics\` <song>
│ 🔎 \`${prefix}google\` <text>
│ 👤 \`${prefix}getpp\` <reply/num>
│ 🔍 \`${prefix}sps\` (Spotify Search)
│ 🧾 \`${prefix}yts\` (youtube Search)
│ 🫧 \`${prefix}ts\` (Tiktok Search)
│ 🖼️ \`${prefix}img\` (Google image)
│ 🔠 \`${prefix}fancy\`
╰──────────────────

╭── [ *📰 ɴᴇᴡs & ᴜᴘᴅᴀᴛᴇs* ] ─
│ 🌍 \`${prefix}worldnews\`
│ 🇱🇰 \`${prefix}sinhalanews\`
│ 📺 \`${prefix}derana\`
│ 🎙️ \`${prefix}news1st\`
╰──────────────────

╭── [ *⚙️ ᴍᴀɪɴ & owner* ] ──
│ 🔗 \`${prefix}pair\` <number>
│ 📡 \`${prefix}ping\`
│ 📢 \`${prefix}hidetag\` <text>
│ ♻️ \`${prefix}alive\`
│ 🪪 \`${prefix}jid\`
│ 🧑‍💻 \`${prefix}owner\`
│ ⚙️ \`${prefix}setting\` (change the setting)
│ 📝 \`${prefix}settings\` (current updated settings)
│ 🚫 \`${prefix}block\`
│ 🔓 \`${prefix}unblock\`
│ 👁️ \`${prefix}vv\` (download viweones)
│ 📥 \`${prefix}save\` (save status)
╰──────────────────

*TEDDY-XMD WHATSAPP BOT*
`;

        // Image Handling
        let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

        // Sending Message with Newsletter Context & Meta Quote
        await socket.sendMessage(sender, {
            image: imagePayload,
            caption: text,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363421104812135@newsletter',
                    newsletterName: 'TEDDY-XMD',
                    serverMessageId: 143
                }
            }
        }, { quoted: metaQuote }); // මෙතන Meta Quote එක දැම්මා

    } catch (e) {
        console.error('Menu command error:', e);
        await socket.sendMessage(sender, { text: "*❌ Error loading menu!*" }, { quoted: msg });
    }
    break;
}


case 'fancy':
case 'font':
case 'style': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // 1. Text එක ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const query = textContent.replace(/^[.\/!#](fancy|font|style)\s*/i, '').trim();

    // Fake Quote
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FANCY" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Fancy Text\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!query) {
        await socket.sendMessage(sender, { 
            text: "✍️ *Please provide text!*\n\nExample: .fancy whiteshadow" 
        }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "✍️", key: msg.key } });

        // 2. API Call
        const apiUrl = `https://movanest.xyz/v2/fancytext?word=${encodeURIComponent(query)}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (!data || !data.status || !Array.isArray(data.results)) {
            await socket.sendMessage(sender, { text: "❌ *Failed to generate fonts.*" }, { quoted: msg });
            break;
        }

        // 3. ලිස්ට් එක හැදීම (Text List)
        let output = `✍️ *FANCY FONT GENERATOR*\n\n`;
        output += `📝 *Input:* ${query}\n`;
        output += `🔢 *Styles:* ${data.results.length}\n\n`;
        output += `──────────────────\n`;

        data.results.forEach((font, index) => {
            // ලස්සනට නම්බර් දාලා පෙන්නනවා
            output += `*${index + 1}.* ${font}\n`;
        });

        output += `──────────────────\n`;
        output += `*TEDDY-XMD*`;

        // 4. යැවීම
        await socket.sendMessage(sender, {
            text: output,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363421104812135@newsletter',
                    newsletterName: 'TEDDY-XMD',
                    serverMessageId: 143
                }
            }
        }, { quoted: metaQuote });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Fancy Error:", e);
        await socket.sendMessage(sender, { text: "❌ *Error generating fancy text.*" }, { quoted: msg });
    }
    break;
}


			  
			  
			  
// ==========================================
// DERANA NEWS
// ==========================================
case 'derana': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // Meta Quote
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_DERANA" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Derana News\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    try {
        await socket.sendMessage(sender, { react: { text: "📰", key: msg.key } });

        const res = await fetch("https://derana.vercel.app/api/derana");
        const data = await res.json();

        if (!data.status) {
            await socket.sendMessage(sender, { text: "⚠️ Unable to fetch Derana News." }, { quoted: msg });
            break;
        }

        const news = data.result;
        let caption = `
📰 *${news.title}*
📅 ${news.date}

${news.desc}

🔗 *Source:* ${news.url}

*TEDDY-XMD*`;

        if (news.image) {
            await socket.sendMessage(sender, { image: { url: news.image }, caption: caption }, { quoted: metaQuote });
        } else {
            await socket.sendMessage(sender, { text: caption }, { quoted: metaQuote });
        }

    } catch (e) {
        console.error("Derana Error:", e);
        await socket.sendMessage(sender, { text: "❌ Derana news error." }, { quoted: msg });
    }
    break;
}

// ==========================================
// NEWS1ST (SIRASA)
// ==========================================
case 'news1st':
case 'sirasa': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_NEWS1ST" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:News1st\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    try {
        await socket.sendMessage(sender, { react: { text: "📰", key: msg.key } });

        const res = await fetch("https://my-news-api.chamodshadow125.workers.dev/");
        const news = await res.json();

        let caption = `
📰 *${news.title}*
📅 ${news.date}

${news.desc}

🔗 *Source:* ${news.url}

*TEDDY-XMD*`;

        if (news.image) {
            await socket.sendMessage(sender, { image: { url: news.image }, caption: caption }, { quoted: metaQuote });
        } else {
            await socket.sendMessage(sender, { text: caption }, { quoted: metaQuote });
        }

    } catch (e) {
        console.error("News1st Error:", e);
        await socket.sendMessage(sender, { text: "❌ News1st news error." }, { quoted: msg });
    }
    break;
}



			  
// ==========================================
// SINHALA NEWS (BOTH)
// ==========================================
case 'sinhalanews': {
    // මේකෙන් දෙකම එකපාර යවනවා
    // අපි කලින් ලියපු logic එකම පාවිච්චි කරනවා, හැබැයි එක දිගට
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SLNEWS" },
        message: { contactMessage: { displayName: "TEDDY-XMD", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:BILAL-MD\nORG:SL News\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    try {
        await socket.sendMessage(sender, { react: { text: "🇱🇰", key: msg.key } });

        // 1. Derana Fetch
        const deranaRes = await fetch("https://derana.vercel.app/api/derana");
        const deranaData = await deranaRes.json();

        if (deranaData.status) {
            const dNews = deranaData.result;
            let dCaption = `📰 *DERANA:* ${dNews.title}\n📅 ${dNews.date}\n\n${dNews.desc}\n\n🔗 ${dNews.url}\n\n> TEDDY-XMD`;
            
            if (dNews.image) await socket.sendMessage(sender, { image: { url: dNews.image }, caption: dCaption }, { quoted: metaQuote });
            else await socket.sendMessage(sender, { text: dCaption }, { quoted: metaQuote });
        }

        // 2. News1st Fetch
        const nRes = await fetch("https://my-news-api.chamodshadow125.workers.dev/");
        const nNews = await nRes.json();
        
        if (nNews.title) {
            let nCaption = `📰 *NEWS1ST:* ${nNews.title}\n📅 ${nNews.date}\n\n${nNews.desc}\n\n🔗 ${nNews.url}\n\n> TEDDY-XMD`;
            
            if (nNews.image) await socket.sendMessage(sender, { image: { url: nNews.image }, caption: nCaption }, { quoted: metaQuote });
            else await socket.sendMessage(sender, { text: nCaption }, { quoted: metaQuote });
        }

    } catch (e) {
        console.error("Sinhala News Error:", e);
        await socket.sendMessage(sender, { text: "❌ Failed to fetch news." }, { quoted: msg });
    }
    break;
}

case 'aiimg':
case 'gen':
case 'imagine': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // 1. මැසේජ් එකෙන් Text එක ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const input = textContent.replace(/^[.\/!#](aiimg|gen|imagine)\s*/i, '').trim();

    // Fake Quote (Official Meta AI Number)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_IMAGE" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:AI Image Generator\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    // Text එකක් නැත්නම් හෝ Help ඉල්ලුවොත් Styles ටික පෙන්නනවා
    if (!input || input.toLowerCase() === 'list') {
        const styleList = `🎨 *AI IMAGE GENERATOR*

To generate an image, use the command like this:
*.gen <prompt> | <style>*

*Example:*
.gen a cute cat | anime

*🧩 Available Styles:*
1. anime (Default)
2. photorealistic
3. digital-art
4. impressionist
5. fantasy
6. sci-fi
7. vintage

> **TEDDY-XMD**`;

        await socket.sendMessage(sender, { 
            image: { url: "https://files.catbox.moe/13nyhx.jpg" }, // ඔයාට කැමති AI ෆොටෝ එකක් මෙතනට දාන්න
            caption: styleList 
        }, { quoted: metaQuote });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } });

        // 2. Prompt සහ Style වෙන් කරගැනීම (Prompt | Style)
        let [prompt, style] = input.split('|').map(item => item.trim());

        // Style එකක් දීලා නැත්නම් Default 'anime' දානවා
        if (!style) style = "anime";

        // 3. API Call
        const apiUrl = `https://ai-pic-whiteshadow.vercel.app/api/unrestrictedai?prompt=${encodeURIComponent(prompt)}&style=${encodeURIComponent(style)}`;
        
        await socket.sendMessage(sender, { text: `🎨 *Generating image...*\nPrompt: ${prompt}\nStyle: ${style}` }, { quoted: metaQuote });

        const res = await fetch(apiUrl);
        const json = await res.json();

        // 4. Validation
        if (!json.status || !json.result) {
            await socket.sendMessage(sender, { text: "❌ *Failed to generate image. Please try a different prompt.*" }, { quoted: msg });
            break;
        }

        const imageUrl = json.result;

        // 5. Image යැවීම
        const caption = `🎨 *AI IMAGE GENERATED*

🖌️ *Prompt:* ${prompt}
🎭 *Style:* ${style}
👤 *Creator:* ${json.creator}

**TEDDY-XMD**`;

        await socket.sendMessage(sender, {
            image: { url: imageUrl },
            caption: caption
        }, { quoted: metaQuote });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("AI Image Error:", e);
        await socket.sendMessage(sender, { 
            text: "❌ *Error connecting to AI Server.*" 
        }, { quoted: msg });
    }
    break;
}
			  



// =================================================
// 1. SPOTIFY DOWNLOADER (Song & Audio)
// =================================================
case 'spotify':
case 'sp': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // මැසේජ් එකෙන් සින්දුවේ නම ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const searchText = textContent.replace(/^[.\/!#](spotify|sp)\s*/i, '').trim();

    // Fake Quote (Updated with Official Meta AI Number)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { 
            remoteJid: "status@broadcast", 
            participant: "0@s.whatsapp.net", 
            fromMe: false, 
            id: "META_AI_SPOTIFY" 
        },
        message: { 
            contactMessage: { 
                displayName: botName, 
                // මෙන්න මෙතන නම්බර් එක මාරු කළා 👇
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Spotify Music\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    if (!searchText) {
        await socket.sendMessage(sender, { text: '❌ *Song name*\n\nExample:\n.spotify Lelena' }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "🎧", key: msg.key } });

        // API Call
        const api = `https://private-api-whiteshadow-md.vercel.app/Spotify?input=${encodeURIComponent(searchText)}`;
        const response = await fetch(api);
        const data = await response.json();

        if (!data || !data.metadata || !data.audio) {
            await socket.sendMessage(sender, { text: '❌ Spotify song Error' }, { quoted: msg });
            break;
        }

        const { title, artist, duration, cover, url } = data.metadata;
        const audio = data.audio;

        // 🎴 Info card sending
        await socket.sendMessage(sender, {
            image: { url: cover },
            caption: `🎵 *Spotify Track Found*

📌 *Title:* ${title}
👤 *Artist:* ${artist}
⏱ *Duration:* ${duration}
🔗 *Spotify:* ${url}

⬇️ *Downloading audio...*

> **TEDDY-XMD**`
        }, { quoted: metaQuote });

        // 🎧 Audio sending
        await socket.sendMessage(sender, {
            audio: { url: audio.url },
            mimetype: 'audio/mpeg',
            fileName: `${title}.mp3`,
            ptt: false 
        }, { quoted: metaQuote });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Spotify Error:", e);
        await socket.sendMessage(sender, { text: '❌ Spotify download failed. Later try කරන්න.' }, { quoted: msg });
    }
    break;
}

// =================================================
// 2. SPOTIFY SEARCH (List Results)
// =================================================
case 'spotifysearch':
case 'sps': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        '';

    const searchText = textContent.replace(/^[.\/!#](spotifysearch|sps)\s*/i, '').trim();

    // Fake Quote (Updated with Official Meta AI Number)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SPOTIFY_SEARCH" },
        message: { 
            contactMessage: { 
                displayName: botName, 
                // මෙන්න මෙතන නම්බර් එක මාරු කළා 👇
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Spotify Search\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    if (!searchText) {
        await socket.sendMessage(sender, { text: '❌ Please provide a song name.' }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "🔍", key: msg.key } });

        const searchRes = await fetch(`https://api.ootaizumi.web.id/search/spotify?query=${encodeURIComponent(searchText)}`);
        const data = await searchRes.json();
        const results = data.result;

        if (!results || !results.length) {
            await socket.sendMessage(sender, { text: '❌ No results found.' }, { quoted: msg });
            break;
        }

        let outputMsg = '🎵 *Spotify Search Results:*\n\n';
        
        // Results ලැයිස්තුව හදාගැනීම
        results.forEach((track, i) => {
            outputMsg += `*${i+1}.* ${track.title}\n👤 ${track.artist}\n⏱ ${track.duration}\n🔗 ${track.url}\n\n`;
        });
        
        outputMsg += '> Use `.spotify <name>` to download.';

        await socket.sendMessage(sender, { text: outputMsg }, { quoted: metaQuote });
        
        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error("Spotify Search Error:", err);
        await socket.sendMessage(sender, { text: '❌ Failed to fetch Spotify search results.' }, { quoted: msg });
    }
    break;
}
			  
case 'owner': {
  try {
    const botName = BOT_NAME_FANCY || 'TEDDY-XMD';
    const logo = config.RCD_IMAGE_PATH;

    // SAFE fake quote (same pattern as activesessions)
    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_OWNER"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:Meta Platforms
TEL;waid=13135550002:+1 313 555 0002
END:VCARD`
        }
      }
    };

    const text = `
👑 *OWNER INFORMATION*

👤 *Name* : Teddy
📞 *Number* : +254799963583
🌍 *Country* : Kenya 
🤖 *Bot* : ${botName}

🕒 Checked at: ${getSriLankaTimestamp()}
`;

    const imagePayload = String(logo).startsWith('http')
      ? { url: logo }
      : fs.readFileSync(logo);

    await socket.sendMessage(
      sender,
      {
        image: imagePayload,
        caption: text,
        footer: `👑 ${botName} OWNER`,
        buttons: [
          {
            buttonId: `${config.PREFIX}menu`,
            buttonText: { displayText: "📋 MENU" },
            type: 1
          },
          {
            buttonId: `${config.PREFIX}ping`,
            buttonText: { displayText: "⚡ PING" },
            type: 1
          }
        ],
        headerType: 4
      },
      { quoted: metaQuote }
    );

  } catch (e) {
    console.error('OWNER ERROR:', e);
    await socket.sendMessage(
      sender,
      { text: '❌ Failed to fetch owner information.' },
      { quoted: msg }
    );
  }
  break;
}			  



			  

case 'alive': {
  await socket.sendMessage(sender, {
    react: { text: '🚀', key: msg.key }
  });

  try {
    const botName   = config.BOT_NAME || 'TEDDY-XMD';
    const prefix    = config.PREFIX || '.';
    const logo      = config.RCD_IMAGE_PATH;
    const version   = config.VERSION || 'v1';
    const connectNb = config.CONNECT_NB || 'Online';
    const pairSite  = 'https://teddyxmdv3-503c80be650a.herokuapp.com/';

    const caption = `
╭━━━〔 🤖 *TEDDY-XMD* 〕━━━╮
┃ ✨ *STATUS* : ACTIVE
┃ 🚀 *VERSION* : ${version}
┃ 🌐 *CONNECTION* : ${connectNb}
┃ ⚙️ *PREFIX* : ${prefix}
╰━━━━━━━━━━━━━━━━━━━╯

📂 *Use* ➜ \`${prefix}menu\`
to view all available commands

🔗 *Mini Bot Pair Website*
${pairSite}

*TEDDY-XMD*
`;

    const imagePayload = String(logo).startsWith('http')
      ? { url: logo }
      : fs.readFileSync(logo);

    await socket.sendMessage(
      sender,
      {
        image: imagePayload,
        caption: caption,
        footer: botName,
        buttons: [
          {
            buttonId: `${prefix}menu`,
            buttonText: { displayText: '📂 MENU' },
            type: 1
          }
        ],
        headerType: 4
      },
      { quoted: msg }
    );

  } catch (e) {
    console.error('Alive command error:', e);
    await socket.sendMessage(
      sender,
      { text: '*❌ Alive status load failed!*' },
      { quoted: msg }
    );
  }
  break;
}




case 'google':
case 'gsearch': {
  // fetch එක import කරගන්නවා (කලින් වගේම)
  const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

  try {
    // 1. මැසේජ් එකේ තියෙන සම්පූර්ණ වචන ටික ගන්නවා
    const rawText = msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption || '';

    // 2. Command එක (.google) අයින් කරලා ඉතුරු ටික ගන්නවා
    const text = rawText.replace(/^[.\/!#](google|gsearch)\s*/i, '').trim();

    // Text එකක් දීලා නැත්නම් Usage එක යවනවා
    if (!text) {
      await socket.sendMessage(
        sender,
        { text: "⚠️ *Google Search*\n\nUsage:\n.google <search term>\nExample: .google tiktok" },
        { quoted: msg }
      );
      break;
    }

    // 3. API Call එක (axios වෙනුවට fetch පාවිච්චි කළා)
    const url = `https://google-search-api.chamodshadow125.workers.dev/?q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const res = await response.json(); // JSON විදියට convert කරනවා

    // Results තියෙනවද බලනවා
    if (!res.status || !res.data || !res.data.length) {
      await socket.sendMessage(
        sender,
        { text: "❌ No results found on Google." },
        { quoted: msg }
      );
      break;
    }

    // 4. Output එක හදනවා
    let out = `🔎 *GOOGLE SEARCH RESULTS*\n\n`;
    
    // මුල් Results 5 විතරක් ගන්නවා
    res.data.slice(0, 5).forEach((item, i) => {
      out += `*${i + 1}.* ${item.title}\n🔗 ${item.link}\n_${item.snippet}_\n\n`;
    });

    // Time function එක නැත්නම් මේ පේළිය අයින් කරන්න, නැත්නම් ඒකත් error එන්න පුළුවන්
    // out += `🕒 Checked at: ${getSriLankaTimestamp()}`; 

    // 5. Fake Quote (Meta AI Style)
    const botName = "TEDDY-XMD"; 
    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_GOOGLE"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Google Search\nTEL;waid=+13135550002:+1 313 555 0002\nEND:VCARD`
        }
      }
    };

    // Send Message
    await socket.sendMessage(
      sender,
      { text: out },
      { quoted: metaQuote }
    );

  } catch (e) {
    console.error('GOOGLE CMD ERROR:', e);
    await socket.sendMessage(
      sender,
      { text: '❌ Failed to fetch search results.' },
      { quoted: msg }
    );
  }
  break;
}

			  
case "mediafire":
case "mfire": {
    // 1. fetch import කරගැනීම
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

    try {
        // 2. මැසේජ් එකෙන් URL එක වෙන් කරගැනීම
        const textContent = msg.message?.conversation ||
                            msg.message?.extendedTextMessage?.text ||
                            msg.message?.imageMessage?.caption ||
                            msg.message?.videoMessage?.caption || '';

        // Command එක අයින් කරලා ලින්ක් එක විතරක් ගන්නවා
        const url = textContent.replace(/^[.\/!#](mediafire|mfire)\s*/i, '').trim();

        // 3. Fake Quote (Meta AI Style)
        const botName = "TEDDY-XMD";
        const metaQuote = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:MediaFire Downloader\nTEL;waid=+13135550002:+1 313 555 0002\nEND:VCARD`
                }
            }
        };

        // ලින්ක් එකක් දීලා නැත්නම්
        if (!url) {
            await socket.sendMessage(sender, {
                text: "❌ *Please provide a MediaFire link!*\n\nExample:\n.mediafire https://www.mediafire.com/file/xxxx"
            }, { quoted: msg });
            break;
        }

        // ⏳ Waiting React
        await socket.sendMessage(sender, { react: { text: "⏳", key: msg.key } });

        // 4. API Call එක (axios වෙනුවට fetch)
        const api = "https://mediafire-api.chamodshadow125.workers.dev/?url=" + encodeURIComponent(url);
        const response = await fetch(api);
        const data = await response.json();

        // 🔎 Error Checking
        if (!data || data.status !== true || !data.result) {
            await socket.sendMessage(sender, {
                text: "⚠️ *Invalid or private MediaFire link. Please check again.*"
            }, { quoted: msg });
            // React එක අයින් කරනවා
            await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
            break;
        }

        const {
            download_url,
            filename = "mediafire_file",
            filesize = "Unknown",
            uploaded = "Unknown"
        } = data.result;

        // ⬇️ Downloading React
        await socket.sendMessage(sender, { react: { text: "⬇️", key: msg.key } });

        const caption = `📥 *MEDIAFIRE DOWNLOADER*

📄 *File:* ${filename}
📦 *Size:* ${filesize}
📆 *Uploaded:* ${uploaded}

> **TEDDY-XMD**`;

        // 5. Document එක යැවීම (Fake Quote සමඟ)
        await socket.sendMessage(sender, {
            document: { url: download_url },
            mimetype: "application/octet-stream", // ඕනෑම ෆයිල් එකක් යවන්න පුළුවන් මයිම් ටයිප් එක
            fileName: filename,
            caption: caption
        }, { quoted: metaQuote });

        // ✅ Success React
        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("MEDIAFIRE ERROR FULL:", e);
        await socket.sendMessage(sender, {
            text: "❌ *Download failed. The file might be too large or the link is expired.*"
        }, { quoted: msg });
        
        await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } });
    }
    break;
}
			  
case 'xhamster':
case 'xham': {
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_MEDIA" },
        message: { contactMessage: { displayName: "TEDDY-XMD", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:MovaNest\nORG:Xham Service\nEND:VCARD` } }
    };

    // 🛠️ FIX: msg.body වෙනුවට ආරක්ෂිතව Text එක ගන්න විදිය
    const text = msg.message?.conversation || 
                 msg.message?.extendedTextMessage?.text || 
                 msg.message?.imageMessage?.caption || 
                 msg.message?.videoMessage?.caption || '';

    // Command එක (.xham) අයින් කරලා ඉතුරු ටික ගන්නවා
    const query = text.replace(/^\S+\s+/, '').trim() || 'random';

    if (!query) {
        return await socket.sendMessage(sender, { text: '❌ *Please provide a query.*' }, { quoted: metaQuote });
    }

    try {
        const searchResponse = await axios.get(`https://movanest.xyz/v2/xhamsearch?query=${encodeURIComponent(query)}`);
        const { results } = searchResponse.data;

        if (!results || results.length === 0) {
            await socket.sendMessage(sender, { text: '❌ *No results found.*' }, { quoted: metaQuote });
            break;
        }

        const randomItem = results[Math.floor(Math.random() * results.length)];
        const { title, duration, url } = randomItem; 

        // Payload Construction
        const payloadNormal = JSON.stringify({ u: url, t: title.substring(0, 30), type: 'n' });
        const payloadDoc = JSON.stringify({ u: url, t: title.substring(0, 30), type: 'd' });

        const caption = `🌟 *Hot Pick for "${query}"!*\n\n🎥 *Title:* ${title}\n⏳ *Duration:* ${duration}\n\nPowered by MovaNest API\n\n*Select your preferred format:*`;

        const buttons = [
            { buttonId: `${config.PREFIX}xham-dl ${payloadNormal}`, buttonText: { displayText: "▶️ View Normally" }, type: 1 },
            { buttonId: `${config.PREFIX}xham-dl ${payloadDoc}`, buttonText: { displayText: "📥 DL as Document" }, type: 1 }
        ];
        
        await socket.sendMessage(sender, { 
            text: caption, 
            buttons, 
            headerType: 1 
        }, { quoted: metaQuote });

    } catch (e) {
        console.error(e);
        await socket.sendMessage(sender, { text: '❌ *Error fetching Xham list.*' });
    }
    break;
}

case 'lyrics':
case 'lyric': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

    // 1. මැසේජ් එකෙන් සින්දුවේ නම ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const songName = textContent.replace(/^[.\/!#](lyrics|lyric)\s*/i, '').trim();

    // 2. Fake Quote (Official Meta AI Number)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { 
            remoteJid: "status@broadcast", 
            participant: "0@s.whatsapp.net", 
            fromMe: false, 
            id: "META_AI_LYRICS" 
        },
        message: { 
            contactMessage: { 
                displayName: botName, 
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Lyrics Search\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    if (!songName) {
        await socket.sendMessage(sender, { 
            text: "❌ *Please provide a song name!*\n\nExample: *.lyrics Lelena*" 
        }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "🎼", key: msg.key } });

        // 3. API Call
        const api = `https://lyrics-api.chamodshadow125.workers.dev/?title=${encodeURIComponent(songName)}`;
        const res = await fetch(api);
        const json = await res.json();

        // 4. Data Validation (ඔයා දුන්න JSON එකට ගැලපෙන්න)
        if (!json.status || !json.data || json.data.length === 0) {
            await socket.sendMessage(sender, { text: "❌ *Lyrics not found for this song.*" }, { quoted: msg });
            break;
        }

        // Array එකේ පලවෙනි result එක ගන්නවා
        const songData = json.data[0];

        const title = songData.name || songData.trackName || songName;
        const artist = songData.artistName || "Unknown Artist";
        const lyrics = songData.plainLyrics || "❌ Lyrics content missing.";

        // 5. Caption සැකසීම
        const caption = `🎼 *LYRICS SEARCH*

🎵 *Title:* ${title}
👤 *Artist:* ${artist}

${lyrics}

> **TEDDY-XMD**`;

        // 6. මැසේජ් එක යැවීම (Image එකක් නැති නිසා Text only)
        await socket.sendMessage(sender, {
            text: caption
        }, { quoted: metaQuote });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Lyrics Error:", e);
        await socket.sendMessage(sender, { 
            text: "❌ *Error fetching lyrics.*" 
        }, { quoted: msg });
    }
    break;
}
			  
  case 'ts': {
    const axios = require('axios');

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const query = q.replace(/^[.\/!]ts\s*/i, '').trim();

    if (!query) {
        return await socket.sendMessage(sender, {
            text: '[❗] TikTok. what you want to watch 🔍'
        }, { quoted: msg });
    }

    async function tiktokSearch(query) {
        try {
            const searchParams = new URLSearchParams({
                keywords: query,
                count: '10',
                cursor: '0',
                HD: '1'
            });

            const response = await axios.post("https://tikwm.com/api/feed/search", searchParams, {
                headers: {
                    'Content-Type': "application/x-www-form-urlencoded; charset=UTF-8",
                    'Cookie': "current_language=en",
                    'User-Agent': "Mozilla/5.0"
                }
            });

            const videos = response.data?.data?.videos;
            if (!videos || videos.length === 0) {
                return { status: false, result: "No videos found." };
            }

            return {
                status: true,
                result: videos.map(video => ({
                    description: video.title || "No description",
                    videoUrl: video.play || ""
                }))
            };
        } catch (err) {
            return { status: false, result: err.message };
        }
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    try {
        const searchResults = await tiktokSearch(query);
        if (!searchResults.status) throw new Error(searchResults.result);

        const results = searchResults.result;
        shuffleArray(results);

        const selected = results.slice(0, 6);

        const cards = await Promise.all(selected.map(async (vid) => {
            const videoBuffer = await axios.get(vid.videoUrl, { responseType: "arraybuffer" });

            const media = await prepareWAMessageMedia({ video: videoBuffer.data }, {
                upload: socket.waUploadToServer
            });

            return {
                body: proto.Message.InteractiveMessage.Body.fromObject({ text: '' }),
                footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: "TEDDY-XMD" }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: vid.description,
                    hasMediaAttachment: true,
                    videoMessage: media.videoMessage // 🎥 Real video preview
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: [] // ❌ No buttons
                })
            };
        }));

        const msgContent = generateWAMessageFromContent(sender, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: `🔎 *TikTok Search:* ${query}` },
                        footer: { text: "> Powered by TEDDY-XMD" },
                        header: { hasMediaAttachment: false },
                        carouselMessage: { cards }
                    })
                }
            }
        }, { quoted: msg });

        await socket.relayMessage(sender, msgContent.message, { messageId: msgContent.key.id });

    } catch (err) {
        await socket.sendMessage(sender, {
            text: `❌ Error: ${err.message}`
        }, { quoted: msg });
    }

    break;
				}

			  case 'gi':
case 'img':
case 'image': {
    const axios = require('axios');

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // remove command name (gi | img | image)
    const query = q.replace(/^[.\/!](gi|img|image)\s*/i, '').trim();

    if (!query) {
        return await socket.sendMessage(sender, {
            text: '[❗] Image search cat 🖼️'
        }, { quoted: msg });
    }

    async function googleImageSearch(query) {
        try {
            const { data } = await axios.get(
                `https://api.zenzxz.my.id/api/search/googleimage?query=${encodeURIComponent(query)}`
            );

            if (!data.success || !data.data?.length) {
                return { status: false, result: 'No images found.' };
            }

            return { status: true, result: data.data };
        } catch (e) {
            return { status: false, result: e.message };
        }
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    try {
        const res = await googleImageSearch(query);
        if (!res.status) throw new Error(res.result);

        shuffle(res.result);
        const selected = res.result.slice(0, 6);

        const cards = await Promise.all(selected.map(async (img) => {
            const imageBuffer = await axios.get(img.url, { responseType: 'arraybuffer' });

            const media = await prepareWAMessageMedia(
                { image: imageBuffer.data },
                { upload: socket.waUploadToServer }
            );

            return {
                body: proto.Message.InteractiveMessage.Body.fromObject({ text: '' }),
                footer: proto.Message.InteractiveMessage.Footer.fromObject({
                    text: 'TEDDY-XMD'
                }),
                header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: `${img.width} x ${img.height}`,
                    hasMediaAttachment: true,
                    imageMessage: media.imageMessage
                }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                    buttons: []
                })
            };
        }));

        const msgContent = generateWAMessageFromContent(sender, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { text: `🖼️ *Image Search:* ${query}` },
                        footer: { text: '> TEDDY-XMD' },
                        header: { hasMediaAttachment: false },
                        carouselMessage: { cards }
                    })
                }
            }
        }, { quoted: msg });

        await socket.relayMessage(
            sender,
            msgContent.message,
            { messageId: msgContent.key.id }
        );

    } catch (err) {
        await socket.sendMessage(sender, {
            text: `❌ Error: ${err.message}`
        }, { quoted: msg });
    }

    break;
}



			  

			  case 'instagram':
case 'ig':
case 'insta': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // 1. මැසේජ් එකෙන් Link එක ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const url = textContent.replace(/^[.\/!#](instagram|ig|insta)\s*/i, '').trim();

    // Fake Quote (Official Meta AI Number)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_IG" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Instagram Downloader\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!url) {
        await socket.sendMessage(sender, { 
            text: "❌ *Please provide an Instagram link!*\n\nExample: .ig https://www.instagram.com/p/TxXxXx/" 
        }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "⏳", key: msg.key } });

        // 2. API Call
        const apiUrl = `https://api.nekolabs.web.id/downloader/instagram?url=${encodeURIComponent(url)}`;
        const res = await fetch(apiUrl);
        const json = await res.json();

        // 3. Validation
        if (!json.success || !json.result) {
            await socket.sendMessage(sender, { text: "❌ *Failed to fetch content. Account might be private.*" }, { quoted: msg });
            break;
        }

        const { metadata, downloadUrl } = json.result;

        // Caption හදාගැනීම
        const caption = `📸 *INSTAGRAM DOWNLOADER*

👤 *User:* ${metadata.username}
❤️ *Likes:* ${metadata.like}
💬 *Comments:* ${metadata.comment}

📝 *Caption:*
${metadata.caption || "No caption"}

> ****`;

        // 4. Media යැවීම (Download URL එක Array එකක් නිසා Loop එකක් දානවා)
        if (downloadUrl && downloadUrl.length > 0) {
            for (let i = 0; i < downloadUrl.length; i++) {
                const mediaUrl = downloadUrl[i];
                
                // Video ද Image ද කියලා check කරනවා
                if (metadata.isVideo) {
                    await socket.sendMessage(sender, {
                        video: { url: mediaUrl },
                        caption: i === 0 ? caption : "", // පලවෙනි එකට විතරක් කැප්ෂන් එක දානවා
                        mimetype: "video/mp4"
                    }, { quoted: metaQuote });
                } else {
                    await socket.sendMessage(sender, {
                        image: { url: mediaUrl },
                        caption: i === 0 ? caption : ""
                    }, { quoted: metaQuote });
                }
            }
            await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });
        } else {
            await socket.sendMessage(sender, { text: "❌ *No media found in the link.*" }, { quoted: msg });
        }

    } catch (e) {
        console.error("Instagram Error:", e);
        await socket.sendMessage(sender, { 
            text: "❌ *Error downloading Instagram post.*" 
        }, { quoted: msg });
    }
    break;
}

case 'yts':
case 'ytsearch': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // 1. මැසේජ් එකෙන් වචනය ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const query = textContent.replace(/^[.\/!#](yts|ytsearch)\s*/i, '').trim();

    // Fake Quote (Meta AI)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_YTS" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:YouTube Search\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!query) {
        await socket.sendMessage(sender, { 
            text: "🔎 *Please provide a search term!*\n\nExample: .yts Smokio" 
        }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "🔎", key: msg.key } });

        // 2. API Call (Whiteshadow YTS API)
        const api = `https://whiteshadow-yts.vercel.app/?q=${encodeURIComponent(query)}`;
        const res = await fetch(api);
        const data = await res.json();

        // Validation
        if (!data.success || !data.videos || data.videos.length === 0) {
            await socket.sendMessage(sender, { text: "❌ *No results found!*" }, { quoted: msg });
            break;
        }

        // 3. List එක හැදීම (පළවෙනි 10 විතරයි)
        let output = `🔎 *YOUTUBE SEARCH RESULTS*\n\n`;

        // JSON එකේ හැටියට v.name, v.duration, v.published පාවිච්චි කරනවා
        data.videos.slice(0, 10).forEach((v, i) => {
            // Channel එකක් නම් List එකට දාන්නේ නෑ (Video විතරයි)
            if (v.type === 'video') {
                output += `*${i + 1}.* ${v.name}\n`;
                output += `⏱️ ${v.duration} | 👀 ${v.views}\n`;
                output += `📅 ${v.published}\n`;
                output += `🔗 ${v.url}\n\n`;
            }
        });

        output += `> *To download, copy the link and use .video or .song command.*`;

        // 4. යැවීම (පළවෙනි වීඩියෝ එකේ Thumbnail එකත් එක්ක)
        const firstThumb = data.videos[0].thumbnail;

        await socket.sendMessage(sender, {
            image: { url: firstThumb },
            caption: output,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363421104812135@newsletter',
                    newsletterName: 'TEDDY-XMD',
                    serverMessageId: 143
                }
            }
        }, { quoted: metaQuote });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("YTS Error:", e);
        await socket.sendMessage(sender, { 
            text: "❌ *Error searching YouTube.*" 
        }, { quoted: msg });
    }
    break;
}

			  

			  
case 'xham-dl': {
    try {
        // 🛠️ FIX: Button ID එක හරියටම ගන්න විදිය
        // අපි මුලින්ම බලනවා මේක Button එකක් click කිරීමක්ද කියලා
        const buttonId = msg.message?.buttonsResponseMessage?.selectedButtonId || 
                         msg.message?.templateButtonReplyMessage?.selectedId || 
                         msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                         msg.message?.conversation || 
                         msg.message?.extendedTextMessage?.text || '';

        // JSON Payload එක වෙන් කරගැනීම
        // දැන් අපි buttonId එක ඇතුලේ '{' ලකුණ තියෙනවද බලනවා
        const jsonStartIndex = buttonId.indexOf('{');
        
        if (jsonStartIndex === -1) {
            console.log("Error: JSON not found in Button ID");
            // JSON නැත්නම් නිකන් ඉන්න (Reply කරන්න එපා, නැත්නම් බොට් පිස්සු කෙළියි)
            break; 
        }

        const jsonStr = buttonId.slice(jsonStartIndex);
        const data = JSON.parse(jsonStr);
        const { u: pageUrl, t: title, type } = data;

        await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });

        const detailResponse = await axios.get(`https://movanest.xyz/v2/xhamdetail?url=${encodeURIComponent(pageUrl)}`);
        const { results: detailResult } = detailResponse.data;

        if (!detailResult || !detailResult.videoUrl) {
            await socket.sendMessage(sender, { text: '❌ *Failed to fetch video source.*' }, { quoted: msg });
            break;
        }

        const videoUrl = detailResult.videoUrl;
        const caption = `🔥 *Xham: ${title}*\n\nPowered BY Teddy Tech Hub`;

        if (type === 'n') {
            await socket.sendMessage(sender, { video: { url: videoUrl }, caption: caption }, { quoted: msg });
        } else {
            const cleanTitle = (title || 'video').replace(/[^a-zA-Z0-9]/g, '_');
            await socket.sendMessage(sender, { document: { url: videoUrl }, mimetype: 'video/mp4', fileName: `${cleanTitle}.mp4`, caption: caption }, { quoted: msg });
        }

    } catch (e) {
        console.error("Xham Download Error:", e);
        // Error එකක් ආවොත් විතරක් reply කරන්න
        await socket.sendMessage(sender, { text: '❌ *Error downloading video.*' }, { quoted: msg });
    }
    break;
}
			  
case 'wtype': {
  await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change work type.' }, { quoted: dxz });
    }
    
    let q = args[0];
    const settings = {
      groups: "groups",
      inbox: "inbox", 
      private: "private",
      public: "public"
    };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.WORK_TYPE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Work Type updated to: ${settings[q]}*` }, { quoted: dxz });
    } else {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- public\n- groups\n- inbox\n- private" }, { quoted: dxz });
    }
  } catch (e) {
    console.error('Wtype command error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your work type!*" }, { quoted: dxz });
  }
  break;
}

case 'botpresence': {
  await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change bot presence.' }, { quoted: dxz });
    }
    
    let q = args[0];
    const settings = {
      online: "available",
      offline: "unavailable"
    };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.PRESENCE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      // Apply presence immediately
      await socket.sendPresenceUpdate(settings[q]);
      
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Bot Presence updated to: ${q}*` }, { quoted: dxz });
    } else {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- online\n- offline" }, { quoted: dxz });
    }
  } catch (e) {
    console.error('Botpresence command error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your bot presence!*" }, { quoted: dxz });
  }
  break;
}

case 'autotyping': {
  await socket.sendMessage(sender, { react: { text: '⌨️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change auto typing.' }, { quoted: dxz });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_TYPING = settings[q];
      
      // If turning on auto typing, turn off auto recording to avoid conflict
      if (q === 'on') {
        userConfig.AUTO_RECORDING = "false";
      }
      
      await setUserConfigInMongo(sanitized, userConfig);
      
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Auto Typing ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: dxz });
    } else {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Options:* on / off" }, { quoted: dxz });
    }
  } catch (e) {
    console.error('Autotyping error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating auto typing!*" }, { quoted: dxz });
  }
  break;
}

case 'rstatus': {
  await socket.sendMessage(sender, { react: { text: '👁️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change status seen setting.' }, { quoted: dxz });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_VIEW_STATUS = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Status Seen ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: dxz });
    } else {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: dxz });
    }
  } catch (e) {
    console.error('Rstatus command error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status seen setting!*" }, { quoted: dxz });
  }
  break;
}

case 'creject': {
  await socket.sendMessage(sender, { react: { text: '📞', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change call reject setting.' }, { quoted: dxz });
    }
    
    let q = args[0];
    const settings = { on: "on", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.ANTI_CALL = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Call Reject ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: dxz });
    } else {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: dxz });
    }
  } catch (e) {
    console.error('Creject command error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your call reject setting!*" }, { quoted: dxz });
  }
  break;
}

case 'activesessions':
case 'active':
case 'bots': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Permission check - only owner and admins can use this
    const admins = await loadAdminsFromMongo();
    const normalizedAdmins = (admins || []).map(a => (a || '').toString());
    const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
    const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);

    if (!isOwner && !isAdmin) {
      await socket.sendMessage(sender, { 
        text: '❌ Permission denied. Only bot owner or admins can check active sessions.' 
      }, { quoted: msg });
      break;
    }

    const activeCount = activeSockets.size;
    const activeNumbers = Array.from(activeSockets.keys());

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ACTIVESESSIONS" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    // Determine caption based on command case
    let title, subtitle;
    switch (command) {  // Assuming 'command' is the variable holding the case value (e.g., from earlier switch logic)
      case 'activesessions':
        title = '🔄 ACTIVE SESSIONS OVERVIEW';
        subtitle = 'Monitor your bot\'s live connections';
        break;
      case 'active':
        title = '⚡ LIVE ACTIVE STATUS';
        subtitle = 'Real-time bot activity snapshot';
        break;
      case 'bots':
        title = '🤖 CONNECTED BOTS LIST';
        subtitle = 'All deployed bots and sessions';
        break;
      default:
        title = '🤖 ACTIVE SESSIONS - ' + botName;
        subtitle = 'Default session report';
    }

    let text = `*${title}*\n\n`;
    text += `📊 *Total Active Sessions:* ${activeCount}\n`;
    text += `${subtitle}\n\n`;

    if (activeCount > 0) {
      text += `📱 *Active Numbers:*\n`;
      activeNumbers.forEach((num, index) => {
        text += `${index + 1}. ${num}\n`;
      });
    } else {
      text += `⚠️ No active sessions found.`;
    }

    text += `\n🕒 Checked at: ${getSriLankaTimestamp()}`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `📊 ${botName} SESSION STATUS`,
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
        { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ PING" }, type: 1 }
      ],
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('activesessions error', e);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to fetch active sessions information.' 
    }, { quoted: msg });
  }
  break;
}
			  
case 'arm': {
  await socket.sendMessage(sender, { react: { text: '❤️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change status react setting.' }, { quoted: dxz });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_LIKE_STATUS = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Status React ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: dxz });
    } else {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: dxz });
    }
  } catch (e) {
    console.error('Arm command error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status react setting!*" }, { quoted: dxz });
  }
  break;
}

case 'mread': {
  await socket.sendMessage(sender, { react: { text: '📖', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change message read setting.' }, { quoted: dxz });
    }
    
    let q = args[0];
    const settings = { all: "all", cmd: "cmd", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_READ_MESSAGE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      let statusText = "";
      switch (q) {
        case "all":
          statusText = "READ ALL MESSAGES";
          break;
        case "cmd":
          statusText = "READ ONLY COMMAND MESSAGES"; 
          break;
        case "off":
          statusText = "DONT READ ANY MESSAGES";
          break;
      }
      
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Message Read: ${statusText}*` }, { quoted: dxz });
    } else {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- all\n- cmd\n- off" }, { quoted: dxz });
    }
  } catch (e) {
    console.error('Mread command error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your message read setting!*" }, { quoted: dxz });
  }
  break;
}

case 'autorecording': {
  await socket.sendMessage(sender, { react: { text: '🎥', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change auto recording.' }, { quoted: dxz });
    }
    
    let q = args[0];
    
    if (q === 'on' || q === 'off') {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_RECORDING = (q === 'on') ? "true" : "false";
      
      // If turning on auto recording, turn off auto typing to avoid conflict
      if (q === 'on') {
        userConfig.AUTO_TYPING = "false";
      }
      
      await setUserConfigInMongo(sanitized, userConfig);
      
      // Immediately stop any current recording if turning off
      if (q === 'off') {
        await socket.sendPresenceUpdate('available', sender);
      }
      
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Auto Recording ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: dxz });
    } else {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid! Use:* .autorecording on/off" }, { quoted: dxz });
    }
  } catch (e) {
    console.error('Autorecording error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating auto recording!*" }, { quoted: dxz });
  }
  break;
}

case 'prefix': {
  await socket.sendMessage(sender, { react: { text: '🔣', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change prefix.' }, { quoted: dxz });
    }
    
    let newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 2) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: "❌ *Invalid prefix!*\nPrefix must be 1-2 characters long." }, { quoted: dxz });
    }
    
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    userConfig.PREFIX = newPrefix;
    await setUserConfigInMongo(sanitized, userConfig);
    
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ *Your Prefix updated to: ${newPrefix}*` }, { quoted: dxz });
  } catch (e) {
    console.error('Prefix command error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your prefix!*" }, { quoted: dxz });
  }
  break;
}

case 'settings': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can view settings.' }, { quoted: dxz });
    }

    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || BOT_NAME_FANCY;
    
    const settingsText = `*╭─── 🤖 Ｃｕｒｒｅｎｔ Ｓｅｔｔｉｎｇ───⊷*
*┋*
*┋*
*┋•*🔧 \`Work Type:\` ${currentConfig.WORK_TYPE || 'public'}
*┋*
*┋•*🎭 \`Presence:\` ${currentConfig.PRESENCE || 'available'}
*┋*
*┋•*👁️ \`Auto Status Seen:\` ${currentConfig.AUTO_VIEW_STATUS || 'true'}
*┋*
*┋•*❤️ \`Auto Status React:\` ${currentConfig.AUTO_LIKE_STATUS || 'true'}
*┋*
*┋•* \`Auto Reject Call:\` ${currentConfig.ANTI_CALL || 'off'}
*┋*
*┋*📖 \`Auto Read Message:\` ${currentConfig.AUTO_READ_MESSAGE || 'off'}
*┋*
*┋•*🎥 \`Auto Recording:\` ${currentConfig.AUTO_RECORDING || 'false'}
*┋*
*┋•*⌨️ \`Auto Typing:\` ${currentConfig.AUTO_TYPING || 'false'}
*┋*
*┋•*🔣 \`Prefix:\` ${currentConfig.PREFIX || '.'}
*┋*
*┋•*🎭 \`Status Emojis:\` ${(currentConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI).join(' ')}
*┋*
*┋*
*╰──────────────────────⊷*
> Ｕｓｅ \`${currentConfig.PREFIX || '.'}ꜱᴇᴛᴛɪɴɢ\` ｔｏ ｃｈａｎｇｅ \`.ꜱᴇᴛᴛɪɴɢꜱ\` ｖｉａ Ｍｅｎｕ*`;

    await socket.sendMessage(sender, {
      image: { url: currentConfig.logo || config.RCD_IMAGE_PATH },
      caption: settingsText
    }, { quoted: msg });
    
  } catch (e) {
    console.error('Settings command error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: dxz });
  }
  break;
}

case 'checkjid': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can use this command.' }, { quoted: dxz });
    }

    const target = args[0] || sender;
    let targetJid = target;

    if (!target.includes('@')) {
      if (target.includes('-')) {
        targetJid = target.endsWith('@g.us') ? target : `${target}@g.us`;
      } else if (target.length > 15) {
        targetJid = target.endsWith('@newsletter') ? target : `${target}@newsletter`;
      } else {
        targetJid = target.endsWith('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;
      }
    }

    let type = 'Unknown';
    if (targetJid.endsWith('@g.us')) {
      type = 'Group';
    } else if (targetJid.endsWith('@newsletter')) {
      type = 'Newsletter';
    } else if (targetJid.endsWith('@s.whatsapp.net')) {
      type = 'User';
    } else if (targetJid.endsWith('@broadcast')) {
      type = 'Broadcast List';
    } else {
      type = 'Unknown';
    }

    const responseText = `🔍 *JID INFORMATION*\n\n📌 *Type:* ${type}\n🆔 *JID:* ${targetJid}\n\n╰──────────────────────`;

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: responseText
    }, { quoted: msg });

  } catch (error) {
    console.error('Checkjid command error:', error);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHECKJID2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error checking JID information!*" }, { quoted: dxz });
  }
  break;
}

case 'emojis': {
  await socket.sendMessage(sender, { react: { text: '🎭', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    
    // Permission check - only session owner or bot owner can change emojis
    if (senderNum !== sanitized && senderNum !== ownerNum) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change status reaction emojis.' }, { quoted: dxz });
    }
    
    let newEmojis = args;
    
    if (!newEmojis || newEmojis.length === 0) {
      // Show current emojis if no args provided
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      const currentEmojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
      
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      
      return await socket.sendMessage(sender, { 
        text: `🎭 *Current Status Reaction Emojis:*\n\n${currentEmojis.join(' ')}\n\nUsage: \`.emojis 😀 😄 😊 🎉 ❤️\`` 
      }, { quoted: dxz });
    }
    
    // Validate emojis (basic check)
    const invalidEmojis = newEmojis.filter(emoji => !/\p{Emoji}/u.test(emoji));
    if (invalidEmojis.length > 0) {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { 
        text: `❌ *Invalid emojis detected:* ${invalidEmojis.join(' ')}\n\nPlease use valid emoji characters only.` 
      }, { quoted: dxz });
    }
    
    // Get user-specific config from MongoDB
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    
    // Update ONLY this user's emojis
    userConfig.AUTO_LIKE_EMOJI = newEmojis;
    
    // Save to MongoDB
    await setUserConfigInMongo(sanitized, userConfig);
    
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    
    await socket.sendMessage(sender, { 
      text: `✅ *Your Status Reaction Emojis Updated!*\n\nNew emojis: ${newEmojis.join(' ')}\n\nThese emojis will be used for your automatic status reactions.` 
    }, { quoted: dxz });
    
  } catch (e) {
    console.error('Emojis command error:', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS5" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your status reaction emojis!*" }, { quoted: dxz });
  }
  break;
}

case 'cfn': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const full = body.slice(config.PREFIX.length + command.length).trim();
  if (!full) {
    await socket.sendMessage(sender, { text: `❗ Provide input: .cfn <jid@newsletter> | emoji1,emoji2\nExample: .cfn 120363412042273829@newsletter | 🔥,❤️` }, { quoted: msg });
    break;
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = (admins || []).map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isOwner || isAdmin)) {
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or configured admins can add | ssss.' }, { quoted: msg });
    break;
  }

  let jidPart = full;
  let emojisPart = '';
  if (full.includes('|')) {
    const split = full.split('|');
    jidPart = split[0].trim();
    emojisPart = split.slice(1).join('|').trim();
  } else {
    const parts = full.split(/\s+/);
    if (parts.length > 1 && parts[0].includes('@newsletter')) {
      jidPart = parts.shift().trim();
      emojisPart = parts.join(' ').trim();
    } else {
      jidPart = full.trim();
      emojisPart = '';
    }
  }

  const jid = jidPart;
  if (!jid || !jid.endsWith('@newsletter')) {
    await socket.sendMessage(sender, { text: '❗ Invalid JID. Example: 120363402094635383@newsletter' }, { quoted: msg });
    break;
  }

  let emojis = [];
  if (emojisPart) {
    emojis = emojisPart.includes(',') ? emojisPart.split(',').map(e => e.trim()) : emojisPart.split(/\s+/).map(e => e.trim());
    if (emojis.length > 20) emojis = emojis.slice(0, 20);
  }

  try {
    if (typeof socket.newsletterFollow === 'function') {
      await socket.newsletterFollow(jid);
    }

    await addNewsletterToMongo(jid, emojis);

    const emojiText = emojis.length ? emojis.join(' ') : '(default set)';

    // Meta mention for botName
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ Channel followed and saved!\n\nJID: ${jid}\nEmojis: ${emojiText}\nSaved by: @${senderIdSimple}`,
      footer: `📌 ${botName} | 2026`,
      mentions: [nowsender], // user mention
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📂 MENU" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (e) {
    console.error('cfn error', e);
    await socket.sendMessage(sender, { text: `❌ Failed to save/| 2026: ${e.message || e}` }, { quoted: msg });
  }
  break;
}

case 'chr': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');

  const q = body.split(' ').slice(1).join(' ').trim();
  if (!q.includes(',')) return await socket.sendMessage(sender, { text: "❌ Usage: chr <channelJid/messageId>,<emoji>" }, { quoted: msg });

  const parts = q.split(',');
  let channelRef = parts[0].trim();
  const reactEmoji = parts[1].trim();

  let channelJid = channelRef;
  let messageId = null;
  const maybeParts = channelRef.split('/');
  if (maybeParts.length >= 2) {
    messageId = maybeParts[maybeParts.length - 1];
    channelJid = maybeParts[maybeParts.length - 2].includes('@newsletter') ? maybeParts[maybeParts.length - 2] : channelJid;
  }

  if (!channelJid.endsWith('@newsletter')) {
    if (/^\d+$/.test(channelJid)) channelJid = `${channelJid}@newsletter`;
  }

  if (!channelJid.endsWith('@newsletter') || !messageId) {
    return await socket.sendMessage(sender, { text: '❌ Provide channelJid/messageId format.' }, { quoted: msg });
  }

  try {
    await socket.newsletterReactMessage(channelJid, messageId.toString(), reactEmoji);
    await saveNewsletterReaction(channelJid, messageId.toString(), reactEmoji, sanitized);

    // BotName meta mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHR" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ Reacted successfully!\n\nChannel: ${channelJid}\nMessage: ${messageId}\nEmoji: ${reactEmoji}\nBy: @${senderIdSimple}`,
      footer: `📌 ${botName} REACTION`,
      mentions: [nowsender], // user mention
      buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📂 MENU" }, type: 1 }],
      headerType: 4
    }, { quoted: metaQuote }); // <-- botName meta mention

  } catch (e) {
    console.error('chr command error', e);
    await socket.sendMessage(sender, { text: `❌ Failed to react: ${e.message || e}` }, { quoted: msg });
  }
  break;
}

case 'activesessions':
case 'active':
case 'bots': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    // Permission check - only owner and admins can use this
    const admins = await loadAdminsFromMongo();
    const normalizedAdmins = (admins || []).map(a => (a || '').toString());
    const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
    const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);

    if (!isOwner && !isAdmin) {
      await socket.sendMessage(sender, { 
        text: '❌ Permission denied. Only bot owner or admins can check active sessions.' 
      }, { quoted: msg });
      break;
    }

    const activeCount = activeSockets.size;
    const activeNumbers = Array.from(activeSockets.keys());

    // Meta AI mention
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ACTIVESESSIONS" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let text = `🤖 *ACTIVE SESSIONS - ${botName}*\n\n`;
    text += `📊 *Total Active Sessions:* ${activeCount}\n\n`;

    if (activeCount > 0) {
      text += `📱 *Active Numbers:*\n`;
      activeNumbers.forEach((num, index) => {
        text += `${index + 1}. ${num}\n`;
      });
    } else {
      text += `⚠️ No active sessions found.`;
    }

    text += `\n🕒 Checked at: ${getSriLankaTimestamp()}`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `📊 ${botName} SESSION STATUS`,
      buttons: [
        { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
        { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ PING" }, type: 1 }
      ],
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('activesessions error', e);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to fetch active sessions information.' 
    }, { quoted: msg });
  }
  break;
}




case 'showconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  try {
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SHOWCONFIG" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let txt = `*Session config for ${sanitized}:*\n`;
    txt += `• Bot name: ${botName}\n`;
    txt += `• Logo: ${cfg.logo || config.RCD_IMAGE_PATH}\n`;
    await socket.sendMessage(sender, { text: txt }, { quoted: dxz });
  } catch (e) {
    console.error('showconfig error', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SHOWCONFIG2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Failed to load config.' }, { quoted: dxz });
  }
  break;
}

case 'resetconfig': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can reset configs.' }, { quoted: dxz });
    break;
  }

  try {
    await setUserConfigInMongo(sanitized, {});

    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '✅ Session config reset to defaults.' }, { quoted: dxz });
  } catch (e) {
    console.error('resetconfig error', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RESETCONFIG3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '❌ Failed to reset config.' }, { quoted: dxz });
  }
  break;
}
//💐💐💐💐💐💐






        case 'unfollow': {
  const jid = args[0] ? args[0].trim() : null;
  if (!jid) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD 🚀*';

    const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide channel JID to unfollow. Example:\n.unfollow 120363396379901844@newsletter' }, { quoted: dxz });
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = admins.map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isOwner || isAdmin)) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD MINI BOT*';
    const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or admins can remove channels.' }, { quoted: dxz });
  }

  if (!jid.endsWith('@newsletter')) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD 🚀*';
    const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Invalid JID. Must end with @newsletter' }, { quoted: dxz });
  }

  try {
    if (typeof socket.newsletterUnfollow === 'function') {
      await socket.newsletterUnfollow(jid);
    }
    await removeNewsletterFromMongo(jid);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD  🚀*';
    const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Unfollowed and removed from DB: ${jid}` }, { quoted: dxz });
  } catch (e) {
    console.error('unfollow error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD ᴍɪɴɪ🚀*';
    const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW5" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to unfollow: ${e.message || e}` }, { quoted: dxz });
  }
  break;
}

case 'gjid':
case 'groupjid':
case 'grouplist': {
  try {
    // ✅ Owner check removed — now everyone can use it!

    await socket.sendMessage(sender, { 
      react: { text: "📝", key: msg.key } 
    });

    await socket.sendMessage(sender, { 
      text: "📝 Fetching group list..." 
    }, { quoted: msg });

    const groups = await socket.groupFetchAllParticipating();
    const groupArray = Object.values(groups);

    // Sort by creation time (oldest to newest)
    groupArray.sort((a, b) => a.creation - b.creation);

    if (groupArray.length === 0) {
      return await socket.sendMessage(sender, { 
        text: "❌ No groups found!" 
      }, { quoted: msg });
    }

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY || "TEDDY-XMD";

    // ✅ Pagination setup — 10 groups per message
    const groupsPerPage = 10;
    const totalPages = Math.ceil(groupArray.length / groupsPerPage);

    for (let page = 0; page < totalPages; page++) {
      const start = page * groupsPerPage;
      const end = start + groupsPerPage;
      const pageGroups = groupArray.slice(start, end);

      // ✅ Build message for this page
      const groupList = pageGroups.map((group, index) => {
        const globalIndex = start + index + 1;
        const memberCount = group.participants ? group.participants.length : 'N/A';
        const subject = group.subject || 'Unnamed Group';
        const jid = group.id;
        return `*${globalIndex}. ${subject}*\n👥 Members: ${memberCount}\n🆔 ${jid}`;
      }).join('\n\n');

      const textMsg = `📝 *Group List - ${botName}*\n\n📄 Page ${page + 1}/${totalPages}\n👥 Total Groups: ${groupArray.length}\n\n${groupList}`;

      await socket.sendMessage(sender, {
        text: textMsg,
        footer: `🤖 Powered by ${botName}`
      });

      // Add short delay to avoid spam
      if (page < totalPages - 1) {
        await delay(1000);
      }
    }

  } catch (err) {
    console.error('GJID command error:', err);
    await socket.sendMessage(sender, { 
      text: "❌ Failed to fetch group list. Please try again later." 
    }, { quoted: msg });
  }
  break;
}

case 'cid': {
    // Extract query from message
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // ✅ Dynamic botName load
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '*TEDDY-XMD 𝙢𝙞𝙣𝙞🫧*';

    // ✅ Fake Meta AI vCard (for quoted msg)
    const dxz = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_CID"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    // Clean command prefix (.cid, /cid, !cid, etc.)
    const channelLink = q.replace(/^[.\/!]cid\s*/i, '').trim();

    // Check if link is provided
    if (!channelLink) {
        return await socket.sendMessage(sender, {
            text: '❎ Please provide a WhatsApp Channel link.\n\n📌 *Example:* .cid https://whatsapp.com/channel/123456789'
        }, { quoted: dxz });
    }

    // Validate link
    const match = channelLink.match(/whatsapp\.com\/channel\/([\w-]+)/);
    if (!match) {
        return await socket.sendMessage(sender, {
            text: '⚠️ *Invalid channel link format.*\n\nMake sure it looks like:\nhttps://whatsapp.com/channel/0029VbC3cctHgZWfFwmNWj3Cxxxx'
        }, { quoted: dxz });
    }

    const inviteId = match[1];

    try {
        // Send fetching message
        await socket.sendMessage(sender, {
            text: `🔎 Fetching channel info for: *${inviteId}*`
        }, { quoted: dxz });

        // Get channel metadata
        const metadata = await socket.newsletterMetadata("invite", inviteId);

        if (!metadata || !metadata.id) {
            return await socket.sendMessage(sender, {
                text: '❌ Channel not found or inaccessible.'
            }, { quoted: dxz });
        }

        // Format details
        const infoText = `
📡 *WhatsApp Channel Info*

🆔 *ID:* ${metadata.id}
📌 *Name:* ${metadata.name}
👥 *Followers:* ${metadata.subscribers?.toLocaleString() || 'N/A'}
📅 *Created on:* ${metadata.creation_time ? new Date(metadata.creation_time * 1000).toLocaleString("si-LK") : 'Unknown'}

_© Powered by ${botName}_
`;

        // Send preview if available
        if (metadata.preview) {
            await socket.sendMessage(sender, {
                image: { url: `https://pps.whatsapp.net${metadata.preview}` },
                caption: infoText
            }, { quoted: dxz });
        } else {
            await socket.sendMessage(sender, {
                text: infoText
            }, { quoted: dxz });
        }

    } catch (err) {
        console.error("CID command error:", err);
        await socket.sendMessage(sender, {
            text: '⚠️ An unexpected error occurred while fetching channel info.'
        }, { quoted: dxz });
    }

    break;
}


// =================================================
// 1. TIKTOK MENU (Show Info & Buttons)
// =================================================
case 'tiktok':
case 'tt': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // මැසේජ් එකෙන් URL එක ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const url = textContent.replace(/^[.\/!#](tiktok|tt)\s*/i, '').trim();

    // Fake Quote (Meta AI)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TIKTOK" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:TikTok Downloader\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!url) {
        await socket.sendMessage(sender, { 
            text: "❌ *Please provide a TikTok URL!*\n\nExample: *.tt https://vt.tiktok.com/ZS5nob6bW/*" 
        }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "⏳", key: msg.key } });

        // API Call
        const api = `https://whiteshadow-api.vercel.app/download/tiktok?url=${encodeURIComponent(url)}`;
        const res = await fetch(api);
        const json = await res.json();

        if (!json.status || !json.result || !json.result.data) {
            await socket.sendMessage(sender, { text: "❌ *Video not found or Private!*" }, { quoted: msg });
            break;
        }

        const data = json.result.data;
        
        // Caption එක හදාගැනීම
        let caption = `🎵 *TIKTOK DOWNLOADER*

📌 *Title:* ${data.title}
👤 *Author:* ${data.author.nickname} (@${data.author.unique_id})
❤️ *Likes:* ${data.digg_count}
💬 *Comments:* ${data.comment_count}
👀 *Views:* ${data.play_count}

> *Select option below ⬇️*`;

        // Buttons හදාගැනීම (.tt_dl <URL> <TYPE>)
        // TYPE: wm (Watermark), nowm (No Watermark), audio (MP3)
        const buttons = [
            { 
                buttonId: `.tt_dl ${url} || nowm`, 
                buttonText: { displayText: "🎬 VIDEO (NO WM)" }, 
                type: 1 
            },
            { 
                buttonId: `.tt_dl ${url} || wm`, 
                buttonText: { displayText: "💧 VIDEO (WITH WM)" }, 
                type: 1 
            },
            { 
                buttonId: `.tt_dl ${url} || audio`, 
                buttonText: { displayText: "🎧 AUDIO ONLY" }, 
                type: 1 
            }
        ];

        // Image එක සහ Buttons යැවීම
        await socket.sendMessage(sender, {
            image: { url: data.cover },
            caption: caption,
            footer: 'TEDDY-XMD Mini',
            buttons: buttons,
            headerType: 4
        }, { quoted: metaQuote });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("TikTok Menu Error:", e);
        await socket.sendMessage(sender, { text: "❌ Error fetching details." }, { quoted: msg });
    }
    break;
}

// =================================================
// 2. TIKTOK DOWNLOAD HANDLER (Buttons)
// =================================================
case 'tt_dl': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // Button එකෙන් එන මැසේජ් එක (.tt_dl URL || TYPE)
    const textContent = msg.message?.buttonsResponseMessage?.selectedButtonId || 
                        msg.message?.conversation || '';

    const inputData = textContent.replace(/^[.\/!#]tt_dl\s*/i, '').trim();
    
    if (!inputData.includes('||')) break;

    const [url, type] = inputData.split(' || ');

    // Fake Quote
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TT_DL" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:TikTok\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    try {
        await socket.sendMessage(sender, { react: { text: "⬇️", key: msg.key } });

        // නැවත API Call එක (URL එක Fresh වෙන්න ඕන නිසා)
        const api = `https://whiteshadow-api.vercel.app/download/tiktok?url=${encodeURIComponent(url)}`;
        const res = await fetch(api);
        const json = await res.json();
        const data = json.result.data;

        if (type === 'nowm') {
            // No Watermark Video
            await socket.sendMessage(sender, {
                video: { url: data.play }, // play = No Watermark
                caption: `🎬 *TIKTOK NO-WM*\n\n> ${data.title}`,
                mimetype: "video/mp4"
            }, { quoted: metaQuote });

        } else if (type === 'wm') {
            // With Watermark Video
            await socket.sendMessage(sender, {
                video: { url: data.wmplay }, // wmplay = With Watermark
                caption: `💧 *TIKTOK WATERMARK*\n\n> ${data.title}`,
                mimetype: "video/mp4"
            }, { quoted: metaQuote });

        } else if (type === 'audio') {
            // Audio Only
            await socket.sendMessage(sender, {
                audio: { url: data.music }, // music = MP3 URL
                mimetype: "audio/mpeg",
                fileName: `${data.music_info.title}.mp3`,
                ptt: false
            }, { quoted: metaQuote });
        }

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("TikTok DL Error:", e);
        await socket.sendMessage(sender, { text: "❌ Download failed." }, { quoted: msg });
    }
    break;
}

// =================================================
// 1. PLAY / SONG COMMAND (Audio)
// =================================================

case 'pair': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
   
    // 1. Text එක සහ Number එක ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const number = textContent.replace(/^[.\/!#]pair\s*/i, '').trim();

    // 2. Fake Quote (Meta AI Style)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { 
            remoteJid: "status@broadcast", 
            participant: "0@s.whatsapp.net", 
            fromMe: false, 
            id: "META_AI_PAIR" 
        },
        message: { 
            contactMessage: { 
                displayName: botName, 
                vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Pairing System\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` 
            } 
        }
    };

    if (!number) {
        await socket.sendMessage(sender, {
            text: '⚠️ *Please provide a number!*\n\n*Usage:* .pair 947xxxxxxxx'
        }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "🔄", key: msg.key } });
        await socket.sendMessage(sender, { text: '🔄 *Generating your pairing code...*' }, { quoted: metaQuote });

        // API Call
        const url = `https://teddyxmdv3-503c80be650a.herokuapp.com/code?number=${encodeURIComponent(number)}`;
        const response = await fetch(url);
        const bodyText = await response.text();

        let result;
        try {
            result = JSON.parse(bodyText);
        } catch (e) {
            await socket.sendMessage(sender, { text: '❌ Server Error: Invalid JSON response.' }, { quoted: msg });
            break;
        }

        if (!result || !result.code) {
            await socket.sendMessage(sender, { text: '❌ Failed to generate code. Check the number format.' }, { quoted: msg });
            break;
        }

        // 3. Button Message එක සැකසීම
        const msgContent = generateWAMessageFromContent(sender, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: { 
                            text: `> *TEDDY-XMD 𝐌𝐈𝐍𝐈 𝐏𝐀𝐈𝐑 𝐒𝐔𝐂𝐂𝐄𝐒𝐒* ✅\n\n🔢 *Number:* +${number}\n🔑 *Code:* ${result.code}\n\n_Click the button below to copy the code!_` 
                        },
                        footer: { 
                            text: "TEDDY-XMD" 
                        },
                        header: { 
                            title: "🔐 PAIRING CODE",
                            hasMediaAttachment: false 
                        },
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                            buttons: [
                                {
                                    // 📋 COPY BUTTON
                                    name: "cta_copy",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "📋 COPY CODE",
                                        copy_code: result.code, // මෙතන තමයි Copy වෙන code එක තියෙන්නේ
                                        id: "copy_code_btn"
                                    })
                                },
                                {
                                    // 🌐 URL BUTTON
                                    name: "cta_url",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "🌐 PAIRING SITE",
                                        url: "https://teddyxmdv3-503c80be650a.herokuapp.com/",
                                        merchant_url: "https://teddyxmdv3-503c80be650a.herokuapp.com/"
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        }, { quoted: metaQuote }); // Meta Quote එකත් එක්ක යවනවා

        await socket.relayMessage(sender, msgContent.message, { messageId: msgContent.key.id });
        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (err) {
        console.error("Pair Command Error:", err);
        await socket.sendMessage(sender, {
            text: '❌ An error occurred connecting to the server.'
        }, { quoted: msg });
    }
    break;
}


case 'vv':
case 'viewonce':
case 'vo': {
    

    // Fake Quote
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_VV" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:ViewOnce Recovery\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    // 1. Quoted Message එකක් තියෙනවද බලනවා
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted) {
        await socket.sendMessage(sender, { 
            text: "⚠️ *Please reply to a ViewOnce message!*" 
        }, { quoted: msg });
        break;
    }

    try {
        // 2. ViewOnce මැසේජ් එක හරි විදියට හොයාගැනීම (Fix එක මෙතනයි)
        let mediaMessage;
        let msgType;

        if (quoted.viewOnceMessage) {
            // පරණ ක්‍රමය (V1)
            mediaMessage = quoted.viewOnceMessage.message.imageMessage || quoted.viewOnceMessage.message.videoMessage;
        } else if (quoted.viewOnceMessageV2) {
            // අලුත් ක්‍රමය (V2)
            mediaMessage = quoted.viewOnceMessageV2.message.imageMessage || quoted.viewOnceMessageV2.message.videoMessage;
        } else if (quoted.imageMessage && quoted.imageMessage.viewOnce) {
            // කෙලින්ම Image එකක් විදියට ඇවිත් viewOnce flag එක තියෙනවා නම්
            mediaMessage = quoted.imageMessage;
        } else if (quoted.videoMessage && quoted.videoMessage.viewOnce) {
            // කෙලින්ම Video එකක් විදියට ඇවිත් viewOnce flag එක තියෙනවා නම්
            mediaMessage = quoted.videoMessage;
        }

        // තාමත් හොයාගන්න බැරි නම් විතරක් Error එක යවනවා
        if (!mediaMessage) {
            await socket.sendMessage(sender, { 
                text: "❌ *This is not a ViewOnce message!*" 
            }, { quoted: msg });
            break;
        }

        await socket.sendMessage(sender, { react: { text: "🔓", key: msg.key } });

        // 3. Type එක හරියටම තහවුරු කරගැනීම (Mimetype හරහා)
        if (mediaMessage.mimetype.includes('image')) {
            msgType = 'image';
        } else if (mediaMessage.mimetype.includes('video')) {
            msgType = 'video';
        } else {
            await socket.sendMessage(sender, { text: "❌ *Unsupported media type.*" }, { quoted: msg });
            break;
        }

        // Download Logic
        const stream = await downloadContentFromMessage(mediaMessage, msgType);
        let buffer = Buffer.from([]);

        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        // Caption
        const originalCaption = mediaMessage.caption || "";
        const finalCaption = `🔓 *RECOVERED VIEWONCE*\n\n📝 *Caption:* ${originalCaption}\n\n> **TEDDY-XMD**`;

        // 4. ආපහු යැවීම
        if (msgType === 'image') {
            await socket.sendMessage(sender, {
                image: buffer,
                caption: finalCaption
            }, { quoted: metaQuote });

        } else if (msgType === 'video') {
            await socket.sendMessage(sender, {
                video: buffer,
                caption: finalCaption,
                mimetype: "video/mp4"
            }, { quoted: metaQuote });
        }

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("ViewOnce Error:", e);
        await socket.sendMessage(sender, { 
            text: "❌ *Error recovering ViewOnce message.*" 
        }, { quoted: msg });
    }
    break;
}

		
// =================================================
// 1. SONG SEARCH & MENU (MAIN COMMAND)
// =================================================
case 'play':
case 'song': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // මැසේජ් එකෙන් නම ගන්නවා
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption ||
                        msg.message?.videoMessage?.caption || '';

    const query = textContent.replace(/^[.\/!#](play|song)\s*/i, '').trim();

    // Fake Quote (Meta AI)
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SONG" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Music Player\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!query) {
        await socket.sendMessage(sender, { text: "❌ *Please give me a song name!*\nExample: .song Night Changes" }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "🎧", key: msg.key } });

        // 1. API Call (Info ගන්න)
        const api = `https://yt-dlv3.vercel.app/api/ytdl?q=${encodeURIComponent(query)}&type=mp3&quality=320`;
        const res = await fetch(api);
        const json = await res.json();

        // Error Check
        if (!json.status || !json.url) {
            await socket.sendMessage(sender, { text: "❌ *Song not found!*" }, { quoted: msg });
            break;
        }

        // Caption එක හදාගැනීම
        const caption = `🎵 *MUSIC PLAYER*

📌 *Title:* ${json.title}
👤 *Artist:* ${json.uploader}
⏱ *Duration:* ${(json.duration / 60).toFixed(2)} mins
👀 *Views:* ${json.viewCount}
📅 *Uploaded:* ${json.uploadDate}

> *Select format below ⬇️*`;

        // 2. Buttons හදාගැනීම
        // URL එක දිග වැඩි නිසා අපි Query එකම Button ID එකට යවනවා
        const buttons = [
            { 
                buttonId: `.song_select ${query} || audio`, 
                buttonText: { displayText: "🎧 AUDIO (MP3)" }, 
                type: 1 
            },
            { 
                buttonId: `.song_select ${query} || document`, 
                buttonText: { displayText: "📂 DOCUMENT (FILE)" }, 
                type: 1 
            }
        ];

        // 3. Image සහ Buttons යැවීම
        await socket.sendMessage(sender, {
            image: { url: json.thumbnail },
            caption: caption,
            footer: 'TEDDY-XMD Mini',
            buttons: buttons,
            headerType: 4
        }, { quoted: metaQuote });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Song Search Error:", e);
        await socket.sendMessage(sender, { text: "❌ *Error searching song.*" }, { quoted: msg });
    }
    break;
}

// =================================================
// 2. SONG DOWNLOAD HANDLER (BUTTON ACTION)
// =================================================
case 'song_select': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    // Button එකෙන් එන Data එක (.song_select QUERY || TYPE)
    const textContent = msg.message?.buttonsResponseMessage?.selectedButtonId || 
                        msg.message?.conversation || '';

    const inputData = textContent.replace(/^[.\/!#]song_select\s*/i, '').trim();
    
    if (!inputData.includes('||')) break;

    const [q, type] = inputData.split(' || ');

    // Fake Quote
    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_DL" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Downloading...\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    try {
        await socket.sendMessage(sender, { react: { text: "⬇️", key: msg.key } });

        // 1. API Call (Download URL එක ගන්න ආයිමත් Call කරනවා)
        const api = `https://yt-dlv3.vercel.app/api/ytdl?q=${encodeURIComponent(q)}&type=mp3&quality=320`;
        const res = await fetch(api);
        const json = await res.json();

        if (!json.status || !json.url) {
            await socket.sendMessage(sender, { text: "❌ *Download Failed! Try again.*" }, { quoted: msg });
            break;
        }

        const downloadUrl = json.url;
        const title = json.title;
        const filename = json.filename || `${title}.mp3`;

        // 2. File එක යැවීම
        if (type === 'audio') {
            // Audio විදියට
            await socket.sendMessage(sender, {
                audio: { url: downloadUrl },
                mimetype: "audio/mpeg",
                fileName: filename,
                ptt: false
            }, { quoted: metaQuote });

        } else if (type === 'document') {
            // Document විදියට
            await socket.sendMessage(sender, {
                document: { url: downloadUrl },
                mimetype: "audio/mpeg",
                fileName: filename,
                caption: `🎵 *${title}*\n> **TEDDY-XMD**`
            }, { quoted: metaQuote });
        }

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Song DL Error:", e);
        await socket.sendMessage(sender, { text: "❌ *Error downloading file.*" }, { quoted: msg });
    }
    break;
}


// =================================================
// 2. VIDEO COMMAND
// =================================================
case 'video': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    
    const textContent = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        '';

    const searchQuery = textContent.replace(/^[.\/!#]video\s*/i, '').trim();

    const botName = "TEDDY-XMD";
    const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_VIDEO" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${botName}\nORG:Video Player\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!searchQuery) {
        await socket.sendMessage(sender, { text: "❌ *Please give me a video name!*\nExample: .video Lelena" }, { quoted: msg });
        break;
    }

    try {
        await socket.sendMessage(sender, { react: { text: "🔍", key: msg.key } });

        // 1. Search
        const searchApi = `https://whiteshadow-yts.vercel.app/?q=${encodeURIComponent(searchQuery)}`;
        const searchRes = await fetch(searchApi);
        const searchData = await searchRes.json();

        if (!searchData.success || !searchData.videos || searchData.videos.length === 0) {
            await socket.sendMessage(sender, { text: "❌ *Video not found!*" }, { quoted: msg });
            break;
        }

        const firstVideo = searchData.videos[0];
        const videoUrl = firstVideo.url;

        await socket.sendMessage(sender, { react: { text: "⬇️", key: msg.key } });

        // 2. Download
        const dlApi = `https://ytapi-whiteshadow.vercel.app/api/ytdown?url=${encodeURIComponent(videoUrl)}`;
        const dlRes = await fetch(dlApi);
        const dlData = await dlRes.json();

        if (!dlData.video || dlData.video.length === 0) {
            await socket.sendMessage(sender, { text: "❌ *Failed to fetch video!*" }, { quoted: msg });
            break;
        }

        // 360p හෝ 480p සොයාගැනීම (නැත්නම් පලවෙනි එක)
        const videoFile = dlData.video.find(v => v.quality.includes('360') || v.quality.includes('480')) || dlData.video[0];

        const caption = `🎬 *TEDDY-XMD VIDEO*

📌 *Title:* ${firstVideo.name}
⏱ *Duration:* ${firstVideo.duration}
👀 *Views:* ${firstVideo.views}
🔗 *Url:* ${firstVideo.url}

> *Downloading Video...*`;

        // 3. Video File යැවීම
        await socket.sendMessage(sender, {
            video: { url: videoFile.download_url },
            mimetype: "video/mp4",
            caption: caption
        }, { quoted: metaQuote });

        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.error("Video Command Error:", e);
        await socket.sendMessage(sender, { text: "❌ *Error fetching video.*" }, { quoted: msg });
    }
    break;
}


case 'addadmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD B O T 🚀*';

    const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid or number to add as admin\nExample: .addadmin 9477xxxxxxx' }, { quoted: dxz });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD*';

    const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Only owner can add admins.' }, { quoted: dxz });
  }

  try {
    await addAdminToMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD 𝙢𝙞𝙣𝙞*';

    const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Added admin: ${jidOr}` }, { quoted: dxz });
  } catch (e) {
    console.error('addadmin error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD M I N I  B O T 🚀*';
    const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `❌ Failed to add admin: ${e.message || e}` }, { quoted: dxz });
  }
  break;
}

case 'deladmin': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD*';

    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN1" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide a jid/number to remove\nExample: .deladmin 2547xxxxxxx' }, { quoted: dxz });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD*';

    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Only owner can remove admins.' }, { quoted: dxz });
  }

  try {
    await removeAdminFromMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD*';

    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN3" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Removed admin: ${jidOr}` }, { quoted: dxz });
  } catch (e) {
    console.error('deladmin error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD M I N I  B O T 🚀*';
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DELADMIN4" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `❌ Failed to remove admin: ${e.message || e}` }, { quoted: dxz });
  }
  break;
}

case 'admins': {
  try {
    const list = await loadAdminsFromMongo();
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD M I N I  B O T 🚀*';

    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { text: 'No admins configured.' }, { quoted: dxz });
    }

    let txt = '*👑 Admins:*\n\n';
    for (const a of list) txt += `• ${a}\n`;

    await socket.sendMessage(sender, { text: txt }, { quoted: dxz });
  } catch (e) {
    console.error('admins error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '*TEDDY-XMD*';
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '❌ Failed to list admins.' }, { quoted: dxz });
  }
  break;
}
case 'setlogo': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change this session logo.' }, { quoted: dxz });
    break;
  }

  const ctxInfo = (msg.message.extendedTextMessage || {}).contextInfo || {};
  const quotedMsg = ctxInfo.quotedMessage;
  const media = await downloadQuotedMedia(quotedMsg).catch(()=>null);
  let logoSetTo = null;

  try {
    if (media && media.buffer) {
      const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
      fs.ensureDirSync(sessionPath);
      const mimeExt = (media.mime && media.mime.split('/').pop()) || 'jpg';
      const logoPath = path.join(sessionPath, `logo.${mimeExt}`);
      fs.writeFileSync(logoPath, media.buffer);
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = logoPath;
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = logoPath;
    } else if (args && args[0] && (args[0].startsWith('http') || args[0].startsWith('https'))) {
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      cfg.logo = args[0];
      await setUserConfigInMongo(sanitized, cfg);
      logoSetTo = args[0];
    } else {
      const dxz = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: '❗ Usage: Reply to an image with `.setlogo` OR provide an image URL: `.setlogo https://example.com/logo.jpg`' }, { quoted: dxz });
      break;
    }

    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Logo set for this session: ${logoSetTo}` }, { quoted: dxz });
  } catch (e) {
    console.error('setlogo error', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set logo: ${e.message || e}` }, { quoted: dxz });
  }
  break;
}
case 'jid': {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '*TEDDY-XMD*'; // dynamic bot name

    const userNumber = sender.split('@')[0]; 

    // Reaction
    await socket.sendMessage(sender, { 
        react: { text: "🆔", key: msg.key } 
    });

    // Fake contact quoting for meta style
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_FAKE_ID" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
        text: `*🆔 Chat JID:* ${sender}\n*📞 Your Number:* +${userNumber}`,
    }, { quoted: dxz });
    break;
}

// use inside your switch(command) { ... } block

case 'block': {
  try {
    // caller number (who sent the command)
    const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const sessionOwner = (number || '').replace(/[^0-9]/g, '');

    // allow if caller is global owner OR this session's owner
    if (callerNumberClean !== ownerNumberClean && callerNumberClean !== sessionOwner) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌You are not allowed to use this. (Owner or should be the session owner here)' }, { quoted: msg });
      break;
    }

    // determine target JID: reply / mention / arg
    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (ctx?.participant) targetJid = ctx.participant; // replied user
    else if (ctx?.mentionedJid && ctx.mentionedJid.length) targetJid = ctx.mentionedJid[0]; // mentioned
    else if (args && args.length > 0) {
      const possible = args[0].trim();
      if (possible.includes('@')) targetJid = possible;
      else {
        const digits = possible.replace(/[^0-9]/g,'');
        if (digits) targetJid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❗ Please reply or mention the number. Example: .block 2547xxxxxxx' }, { quoted: msg });
      break;
    }

    // normalize
    if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

    // perform block
    try {
      if (typeof socket.updateBlockStatus === 'function') {
        await socket.updateBlockStatus(targetJid, 'block');
      } else {
        // some bailey builds use same method name; try anyway
        await socket.updateBlockStatus(targetJid, 'block');
      }
      try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: `✅ @${targetJid.split('@')[0]} blocked successfully.`, mentions: [targetJid] }, { quoted: msg });
    } catch (err) {
      console.error('Block error:', err);
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ Failed to block the user. (Maybe invalid JID or API failure)' }, { quoted: msg });
    }

  } catch (err) {
    console.error('block command general error:', err);
    try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing block command.' }, { quoted: msg });
  }
  break;
}

case 'unblock': {
  try {
    // caller number (who sent the command)
    const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
    const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
    const sessionOwner = (number || '').replace(/[^0-9]/g, '');

    // allow if caller is global owner OR this session's owner
    if (callerNumberClean !== ownerNumberClean && callerNumberClean !== sessionOwner) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ You are not allowed to use this. (Owner or should be the session owner here)' }, { quoted: msg });
      break;
    }

    // determine target JID: reply / mention / arg
    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    if (ctx?.participant) targetJid = ctx.participant;
    else if (ctx?.mentionedJid && ctx.mentionedJid.length) targetJid = ctx.mentionedJid[0];
    else if (args && args.length > 0) {
      const possible = args[0].trim();
      if (possible.includes('@')) targetJid = possible;
      else {
        const digits = possible.replace(/[^0-9]/g,'');
        if (digits) targetJid = `${digits}@s.whatsapp.net`;
      }
    }

    if (!targetJid) {
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❗ Please reply or mention the number. Example: .block 2547xxxxxxx' }, { quoted: msg });
      break;
    }

    // normalize
    if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
    if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

    // perform unblock
    try {
      if (typeof socket.updateBlockStatus === 'function') {
        await socket.updateBlockStatus(targetJid, 'unblock');
      } else {
        await socket.updateBlockStatus(targetJid, 'unblock');
      }
      try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: `🔓 @${targetJid.split('@')[0]} unblocked successfully.`, mentions: [targetJid] }, { quoted: msg });
    } catch (err) {
      console.error('Unblock error:', err);
      try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
      await socket.sendMessage(sender, { text: '❌ Failed to unblock the user.' }, { quoted: msg });
    }

  } catch (err) {
    console.error('unblock command general error:', err);
    try { await socket.sendMessage(sender, { react: { text: "❌", key: msg.key } }); } catch(e){}
    await socket.sendMessage(sender, { text: '❌ Error occurred while processing unblock command.' }, { quoted: msg });
  }
  break;
}

case 'setbotname': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && senderNum !== ownerNum) {
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change this session bot name.' }, { quoted: dxz });
    break;
  }

  const name = args.join(' ').trim();
  if (!name) {
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Provide bot name. Example: `.setbotname *BILAL-MD* - 01`' }, { quoted: dxz });
  }

  try {
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    cfg.botName = name;
    await setUserConfigInMongo(sanitized, cfg);

    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Bot display name set for this session: ${name}` }, { quoted: dxz });
  } catch (e) {
    console.error('setbotname error', e);
    const dxz = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set bot name: ${e.message || e}` }, { quoted: dxz });
  }
  break;
}

        // default
        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch(e){}
    }

  });
}

// ---------------- Call Rejection Handler ----------------

// ---------------- Simple Call Rejection Handler ----------------

async function setupCallRejection(socket, sessionNumber) {
    socket.ev.on('call', async (calls) => {
        try {
            // Load user-specific config from MongoDB
            const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            if (userConfig.ANTI_CALL !== 'on') return;

            console.log(`📞 Incoming call detected for ${sanitized} - Auto rejecting...`);

            for (const call of calls) {
                if (call.status !== 'offer') continue;

                const id = call.id;
                const from = call.from;

                // Reject the call
                await socket.rejectCall(id, from);
                
                // Send rejection message to caller
                await socket.sendMessage(from, {
                    text: '*🔕 Auto call rejection is enabled. Calls are automatically rejected.*'
                });
                
                console.log(`✅ Auto-rejected call from ${from}`);

                // Send notification to bot user
                const userJid = jidNormalizedUser(socket.user.id);
                const rejectionMessage = formatMessage(
                    '📞 CALL REJECTED',
                    `Auto call rejection is active.\n\nCall from: ${from}\nTime: ${getSriLankaTimestamp()}`,
                    BOT_NAME_FANCY
                );

                await socket.sendMessage(userJid, { 
                    image: { url: config.RCD_IMAGE_PATH }, 
                    caption: rejectionMessage 
                });
            }
        } catch (err) {
            console.error(`Call rejection error for ${sessionNumber}:`, err);
        }
    });
}

// ---------------- Auto Message Read Handler ----------------

async function setupAutoMessageRead(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    // Quick return if no need to process
    const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';

    if (autoReadSetting === 'off') return;

    const from = msg.key.remoteJid;
    
    // Simple message body extraction
    let body = '';
    try {
      const type = getContentType(msg.message);
      const actualMsg = (type === 'ephemeralMessage') 
        ? msg.message.ephemeralMessage.message 
        : msg.message;

      if (type === 'conversation') {
        body = actualMsg.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = actualMsg.extendedTextMessage?.text || '';
      } else if (type === 'imageMessage') {
        body = actualMsg.imageMessage?.caption || '';
      } else if (type === 'videoMessage') {
        body = actualMsg.videoMessage?.caption || '';
      }
    } catch (e) {
      // If we can't extract body, treat as non-command
      body = '';
    }

    // Check if it's a command message
    const prefix = userConfig.PREFIX || config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);

    // Apply auto read rules - SINGLE ATTEMPT ONLY
    if (autoReadSetting === 'all') {
      // Read all messages - one attempt only
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read message (single attempt):', error?.message);
        // Don't retry - just continue
      }
    } else if (autoReadSetting === 'cmd' && isCmd) {
      // Read only command messages - one attempt only
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Command message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read command message (single attempt):', error?.message);
        // Don't retry - just continue
      }
    }
  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    
    try {
      // Load user-specific config from MongoDB
      let autoTyping = config.AUTO_TYPING; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        
        // Check for auto typing in user config
        if (userConfig.AUTO_TYPING !== undefined) {
          autoTyping = userConfig.AUTO_TYPING;
        }
        
        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto typing setting (from user config or global)
      if (autoTyping === 'true') {
        try { 
          await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
          // Stop typing after 3 seconds
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto typing error:', e);
        }
      }
      
      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        try { 
          await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
          // Stop recording after 3 seconds  
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto recording error:', e);
        }
      }
    } catch (error) {
      console.error('Message handler error:', error);
    }
  });
}


// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('👑 OWNER NOTICE — SESSION REMOVED', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
                          || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        console.log(`Connection closed for ${number}. Cleaning dead socket...`);

try {

const cleanNum = number.replace(/[^0-9]/g,'');

activeSockets.delete(cleanNum);
socketCreationTime.delete(cleanNum);

await removeSessionFromMongo(cleanNum);

console.log(`✅ Dead socket fully removed ${cleanNum}`);

} catch(e){

console.error('Cleanup failed', e);

	}
		  
      }

    }

  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  // Prefill from Mongo if available
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    socketCreationTime.set(sanitizedNumber, Date.now());
    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    
    // This function call was causing the error, now it is defined below
    handleMessageRevocation(socket, sanitizedNumber); 
    
    setupAutoMessageRead(socket, sanitizedNumber);
    setupCallRejection(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;

// if (activeSockets.has(sanitizedNumber)) {

// const oldTime = socketCreationTime.get(sanitizedNumber);

// if (oldTime) {

// const diff = Date.now() - oldTime;

// if (diff > 120000) {

// activeSockets.delete(sanitizedNumber);
// socketCreationTime.delete(sanitizedNumber);

// await removeSessionFromMongo(sanitizedNumber);

// console.log(`♻️ Old expired socket removed ${sanitizedNumber}`);

//} else {

// return res.send({
// code: "This number is already connected"
// });

// }
// }
// }
		
      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    // Save creds to Mongo when updated
socket.ev.on('creds.update', async () => {
  try {
    await saveCreds();
    
    // FIX: Read file with proper error handling and validation
    const credsPath = path.join(sessionPath, 'creds.json');
    
    // Check if file exists and has content
    if (!fs.existsSync(credsPath)) {
      console.warn('creds.json file not found at:', credsPath);
      return;
    }
    
    const fileStats = fs.statSync(credsPath);
    if (fileStats.size === 0) {
      console.warn('creds.json file is empty');
      return;
    }
    
    const fileContent = await fs.readFile(credsPath, 'utf8');
    
    // Validate JSON content before parsing
    const trimmedContent = fileContent.trim();
    if (!trimmedContent || trimmedContent === '{}' || trimmedContent === 'null') {
      console.warn('creds.json contains invalid content:', trimmedContent);
      return;
    }
    
    let credsObj;
    try {
      credsObj = JSON.parse(trimmedContent);
    } catch (parseError) {
      console.error('JSON parse error in creds.json:', parseError);
      console.error('Problematic content:', trimmedContent.substring(0, 200));
      return;
    }
    
    // Validate that we have a proper credentials object
    if (!credsObj || typeof credsObj !== 'object') {
      console.warn('Invalid creds object structure');
      return;
    }
    
    const keysObj = state.keys || null;
    await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
    console.log('✅ Creds saved to MongoDB successfully');
    
  } catch (err) { 
    console.error('Failed saving creds on creds.update:', err);
    
    // Additional debug information
    try {
      const credsPath = path.join(sessionPath, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const content = await fs.readFile(credsPath, 'utf8');
        console.error('Current creds.json content:', content.substring(0, 500));
      }
    } catch (debugError) {
      console.error('Debug read failed:', debugError);
    }
  }
});


    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

await numbersCol.updateOne(
{ number: sanitizedNumber },
{
$set: {
connected: connection === 'open',
last_seen: Date.now()
}
},
{ upsert: true }
);

if (connection === 'close') {

const statusCode =
lastDisconnect?.error?.output?.statusCode;

if (statusCode === 401) {

   activeSockets.delete(sanitizedNumber);

   await removeSessionFromMongo(sanitizedNumber);

   console.log(`✅ Fully removed ${sanitizedNumber}`);
}
	
	await numbersCol.deleteOne({
  number: sanitizedNumber
});
await numbersCol.updateOne(
{ number: sanitizedNumber },
{
$set: {
connected: false,
last_seen: Date.now()
}
}
);
}

else {
await numbersCol.updateOne(
{ number: sanitizedNumber },
{
$set: {
connected: false,
last_seen: Date.now()
}
},
{ upsert: true }
)
}
		
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(()=>({ status: 'failed', error: 'joinGroup not configured' }));

          // try follow newsletters if configured
          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch(e){}
            }
          } catch(e){}

          activeSockets.set(sanitizedNumber, socket);
			socketCreationTime.set(sanitizedNumber, Date.now());
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          // Load per-session config (botName, logo)
          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FANCY;
          const useLogo = userConfig.logo || config.RCD_IMAGE_PATH;

          const initialCaption = formatMessage(
  useBotName,
  `*🚀 TEDDY-XMD*\n\n* ᴍɪɴɪ ʙᴏᴛ ɪɴꜰᴏ 📌*\n\n*• \`ᴠᴇʀꜱɪᴏɴ\` : 3.0.0 V*\n*• \`ʙᴏᴛ ᴄᴏɴɴᴇᴄᴛ ɴʙ\` : ${sanitizedNumber}*\n\n*• ᴍɪɴɪ ʙᴏᴛ ꜱᴜᴄᴄᴇꜱꜰᴜʟʟʏ ᴄᴏɴɴᴇᴄᴛᴇᴅ 💫✅*\n\n*🌐 ʙᴏᴛ ᴘᴀɪʀ ᴡᴇʙ ꜱɪᴛᴇ :*\n> https://teddyxmdv3-503c80be650a.herokuapp.com/\n\n`,
  useBotName
);

          // send initial message
          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: initialCaption });
              }
            }
          } catch (e) {
            console.warn('Failed to send initial connect message (image). Falling back to text.', e?.message || e);
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(4000);

          const updatedCaption = formatMessage(
  useBotName,
  `*TEDDY-XMD*\n\n* ᴍɪɴɪ ʙᴏᴛ ɪɴꜰᴏ 📌*\n\n*• \`ᴠᴇʀꜱɪᴏɴ\` : 1.0.0 V*\n*• \`ʙᴏᴛ ᴄᴏɴɴᴇᴄᴛ ɴʙ\` : ${sanitizedNumber}*\n\n*•  ᴍɪɴɪ ʙᴏᴛ ꜱᴜᴄᴄᴇꜱꜰᴜʟʟʏ ᴄᴏɴɴᴇᴄᴛᴇᴅ 💫✅*\n\n*🌐 TEDDY-XMD ᴍɪɴɪ ʙᴏᴛ ᴘᴀɪʀ ᴡᴇʙ ꜱɪᴛᴇ :*\n> https://teddyxmdv3-503c80be650a.herokuapp.com/\n\n`,
  useBotName
);

          try {
            if (sentMsg && sentMsg.key) {
              try {
                await socket.sendMessage(userJid, { delete: sentMsg.key });
              } catch (delErr) {
                console.warn('Could not delete original connect message (not fatal):', delErr?.message || delErr);
              }
            }

            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {
            console.error('Failed during connect-message edit sequence:', e);
          }

          // send admin + owner notifications as before, with session overrides
          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'TEDDY-XMD-main'}`); } catch(e) { console.error('pm2 restart failed', e); }
        }
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
      }

    });


    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }

}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
 // if (!number) return res.status(400).send({ error: 'Number parameter is required' });
 // if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
 });


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: 'TEDDY-XMD  FREE BOT', activesession: activeSockets.size });
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});


router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});


router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);

  try {
    exec(`pm2 restart ${process.env.PM2_NAME || 'TEDDY-XMD-main'}`);
  } catch (e) {
    console.error('Failed to restart pm2:', e);
  }
});
// ---------------- MISSING FUNCTION ADDED HERE ----------------
// This fixes the "ReferenceError: handleMessageRevocation is not defined"
async function handleMessageRevocation(socket, sanitizedNumber) {
    // Basic event listener to prevent crash. 
    // You can add logic here to resend deleted messages if you want.
    socket.ev.on('messages.upsert', async (update) => {
        try {
            const mek = update.messages[0];
            if (!mek || !mek.message) return;
            // Check if protocol message (revoke/delete)
            if (mek.message.protocolMessage && mek.message.protocolMessage.type === 0) {
                // console.log(`Anti-Delete: Message deleted in session ${sanitizedNumber}`);
            }
        } catch (e) {
             // Silent catch to prevent errors
        }
    });
}
// -------------------------------------------------------------


// initialize mongo & auto-reconnect attempt

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{ try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; await EmpirePair(n, mockRes); await delay(500); } } } } catch(e){} })();

module.exports = router;

