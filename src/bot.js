const { Telegraf } = require('telegraf');
const { readSave, writeSave } = require('./storage/save');
const config = require('./config');

// PFAD-KORREKTUREN: Mit ../ verlassen wir den src-Ordner, um auf die Handler zuzugreifen
const SetupHandler = require('../handlers/setup');
const ActionHandler = require('../handlers/action');
const SocialHandler = require('../handlers/social');
const NavigationHandler = require('../handlers/navigation');
const Messenger = require('../utils/messenger'); // Utils liegt ebenfalls auf der Root-Ebene
const Keyboards = require('./ui/keyboards');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Hilfsfunktion für die Handler-Zentralisierung
const getMainKeys = (state) => Keyboards.main(state);
module.exports.getMainKeys = getMainKeys;

// --- COMMANDS ---
bot.start(async (ctx) => {
  const state = await readSave(ctx.from.id);
  await SetupHandler.handleStart(ctx, state, writeSave);
});

bot.command('reset', async (ctx) => {
  await SetupHandler.handleReset(ctx, writeSave);
});

// --- CORE ACTIONS (ACTION HANDLER) ---
bot.action('age_up', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await ActionHandler.handleAgeUp(ctx, state, writeSave);
});

bot.action(/^choice_(.*)_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  const [_, eventId, choiceIndex] = ctx.match;
  await ActionHandler.handleChoice(ctx, state, eventId, choiceIndex, writeSave);
});

// --- NAVIGATION (NAVIGATION HANDLER) ---
bot.action('tree', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await NavigationHandler.handleTree(ctx, state, writeSave);
});

bot.action('diary', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await NavigationHandler.handleDiary(ctx, state, writeSave);
});

bot.action('rel', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await NavigationHandler.handleRelationships(ctx, state, writeSave);
});

bot.action('activities', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await NavigationHandler.handleActivities(ctx, state, writeSave);
});

bot.action('act_disco', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await NavigationHandler.handleDisco(ctx, state, writeSave);
});

bot.action('act_finder', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await NavigationHandler.handleFinder(ctx, state, writeSave);
});

bot.action('main_menu', async (ctx) => {
  const state = await readSave(ctx.from.id);
  await NavigationHandler.handleMainMenu(ctx, state, writeSave);
});

// --- SOCIAL (SOCIAL HANDLER) ---
bot.action(/^interact_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  await SocialHandler.triggerInteractMenu(ctx, state, ctx.match[1]);
});

bot.action(/^act_talk_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  await SocialHandler.handleTalk(ctx, state, ctx.match[1], writeSave);
});

bot.action(/^act_gift_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  await SocialHandler.handleGift(ctx, state, ctx.match[1], writeSave);
});

bot.action(/^act_askmoney_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  await SocialHandler.handleAskMoney(ctx, state, ctx.match[1], writeSave);
});

bot.action(/^act_marry_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  await SocialHandler.handleMarriageProposal(ctx, state, ctx.match[1], writeSave);
});

bot.action(/^act_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  await SocialHandler.handleSex(ctx, state, ctx.match[1], writeSave);
});

bot.action(/^act_ask_rel_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  await SocialHandler.handleRelationshipRequest(ctx, state, ctx.match[1], writeSave);
});

// --- SETUP CALLBACKS ---
bot.action(/set_gender_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.persons[state.current_id].gender = ctx.match[1] === 'M' ? 'M' : 'W';
  await SetupHandler.runSetup(ctx, state, writeSave);
});

bot.action(/set_country_(.*)/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.country = ctx.match[1];
  await SetupHandler.runSetup(ctx, state, writeSave);
});

bot.action(/^set_famname_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  await SocialHandler.handleFamilyNameChoice(ctx, state, ctx.match[1], writeSave);
});

bot.action(/^set_sex_(.*)$/, async (ctx) => {
  const state = await readSave(ctx.from.id);
  state.persons[state.current_id].sexuality = ctx.match[1];
  state.persons[state.current_id].hasSetSexuality = true;
  await ActionHandler.handleSexualityFinalize(ctx, state, writeSave);
});

// --- TEXT INPUT ---
bot.on('text', async (ctx) => {
  const state = await readSave(ctx.from.id);
  if (!state) return;
  const input = ctx.message.text.trim();

  if (state.setupStep === 'name') {
    await SetupHandler.handleNameInput(ctx, state, input, writeSave);
  } else if (state.setupStep === 'naming_baby') {
    await SetupHandler.handleNamingBaby(ctx, state, input, writeSave);
  } else if (state.setupStep === 'typing_custom_famname') {
    await SocialHandler.handleCustomLastName(ctx, state, input, writeSave);
  }
});

bot.on('callback_query', (ctx) => ctx.answerCbQuery());

// Webhook handling via index.js, launch() hier entfernen, falls Webhooks genutzt werden
module.exports = bot;
