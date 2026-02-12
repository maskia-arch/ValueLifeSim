const { Markup } = require('telegraf');
const Engine = require('../src/game/engine'); // Pfad zu src/game korrigiert
const SocialRender = require('../src/ui/social_render'); // Nutzt jetzt den spezialisierten Renderer
const Messenger = require('../utils/messenger');

class SocialHandler {
  /**
   * Öffnet das Interaktionsmenü für einen NPC
   */
  static async triggerInteractMenu(ctx, state, npcId) {
    const npc = state.persons[npcId];
    const p = state.persons[state.current_id];
    const isParent = (npcId === p.motherId || npcId === p.fatherId);
    const isPartner = (npcId === p.partnerId);
    
    let text = `👥 *Interaktion mit ${npc.name}*\nBeziehung: ${npc.relationship}%`;
    const buttons = [[
      Markup.button.callback('💬 Reden', `act_talk_${npcId}`), 
      Markup.button.callback('🎁 Geschenk', `act_gift_${npcId}`)
    ]];
    
    if (isParent) {
      buttons.push([Markup.button.callback('💰 Nach Geld fragen', `act_askmoney_${npcId}`)]);
    } else if (p.age >= 16) {
      if (isPartner) {
          if (npc.relationship === 100 && !p.maritalStatus?.includes('Verheiratet')) {
              buttons.push([Markup.button.callback('💍 Heiraten', `act_marry_${npcId}`)]);
          }
          buttons.push([Markup.button.callback('🔞 Sex haben', `act_sex_${npcId}`)]);
      } else if (npc.relationship >= 80 && !p.partnerId) {
          buttons.push([Markup.button.callback('❤️ Beziehungsantrag', `act_ask_rel_${npcId}`)]);
      }
    }
    buttons.push([Markup.button.callback('⬅️ Zurück', 'rel')]);
    
    // Messenger-Update mit Buttons
    await Messenger.sendUpdate(ctx, state, text, Markup.inlineKeyboard(buttons));
  }

  static async handleTalk(ctx, state, npcId, writeSave) {
    const npc = state.persons[npcId];
    if (npc.relationship >= 100) return ctx.answerCbQuery("✅ Bereits 100%!", { show_alert: true });
    
    npc.relationship = Math.min(100, (npc.relationship || 0) + 5);
    await ctx.answerCbQuery("💬 Gespräch geführt.");
    return this.triggerInteractMenu(ctx, state, npcId);
  }

  static async handleGift(ctx, state, npcId, writeSave) {
    const npc = state.persons[npcId];
    const p = state.persons[state.current_id];
    if (npc.relationship >= 100) return ctx.answerCbQuery("🎁 Bereits 100%!", { show_alert: true });
    if (p.money < 20) return ctx.answerCbQuery("⚠️ Zu wenig Geld (20€ benötigt)!");
    
    p.money -= 20;
    npc.relationship = Math.min(100, (npc.relationship || 0) + 15);
    await ctx.answerCbQuery("🎁 Geschenk überreicht.");
    return this.triggerInteractMenu(ctx, state, npcId);
  }

  static async handleAskMoney(ctx, state, npcId, writeSave) {
    const npc = state.persons[npcId];
    const p = state.persons[state.current_id];
    if (Math.random() < (npc.relationship / 100)) {
      const amount = Math.floor(Math.random() * 50) + 10;
      p.money += amount;
      npc.relationship = Math.max(0, npc.relationship - 5);
      await ctx.answerCbQuery(`💰 Erfolg! +${amount}€`, { show_alert: true });
    } else {
      npc.relationship = Math.max(0, npc.relationship - 10);
      await ctx.answerCbQuery("❌ Abgelehnt.", { show_alert: true });
    }
    return this.triggerInteractMenu(ctx, state, npcId);
  }

  static async handleMarriageProposal(ctx, state, npcId, writeSave) {
    const result = Engine.attemptMarriage(state, npcId);
    if (result.success) {
      state.setupStep = 'choosing_family_name';
      state.pendingPartnerId = npcId;
      
      const keys = Markup.inlineKeyboard([
        [Markup.button.callback(`🏠 ${state.familyLastName}`, `set_famname_player`)],
        [Markup.button.callback(`🏡 ${state.persons[npcId].name.split(' ').pop()}`, `set_famname_npc`)],
        [Markup.button.callback('⌨️ Custom', 'set_famname_custom')]
      ]);
      
      return Messenger.sendUpdate(ctx, state, "🥂 Ein Ja-Wort! Welchen Familiennamen wählt ihr?", keys, writeSave);
    }
    await ctx.answerCbQuery("💔 Momentan noch nicht...", { show_alert: true });
  }

  /**
   * Behandelt Sex-Interaktionen
   */
  static async handleSex(ctx, state, npcId, writeSave) {
    if (Math.random() < 0.2) state.persons[state.current_id].isPregnant = true;
    await ctx.answerCbQuery("🔞 Das war intensiv...", { show_alert: true });
    const bot = require('../src/bot');
    const Render = require('../src/ui/render');
    return Messenger.sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), bot.getMainKeys(state), writeSave);
  }

  /**
   * Behandelt Beziehungsanträge
   */
  static async handleRelationshipRequest(ctx, state, npcId, writeSave) {
    const result = Engine.attemptRelationship(state, npcId);
    await ctx.answerCbQuery(result.success ? "❤️ Erfolg!" : "💔 Abgelehnt", { show_alert: true });
    const bot = require('../src/bot');
    const Render = require('../src/ui/render');
    return Messenger.sendUpdate(ctx, state, Render.status(state.persons[state.current_id], state), bot.getMainKeys(state), writeSave);
  }

  static finalizeMarriage(state, newLastName) {
    const player = state.persons[state.current_id];
    const partner = state.persons[state.pendingPartnerId];
    state.familyLastName = newLastName;
    player.name = player.name.split(' ')[0] + " " + newLastName;
    partner.name = partner.name.split(' ')[0] + " " + newLastName;
    player.maritalStatus = `💍 Verheiratet mit ${partner.name}`;
    partner.maritalStatus = `💍 Verheiratet mit ${player.name}`;
    player.partnerId = partner.id;
    partner.partnerId = player.id;
    state.diary.push(`💍 Hochzeit! Neuer Familienname: ${newLastName}.`);
    state.setupStep = 'done';
    state.pendingPartnerId = null;
  }
}

module.exports = SocialHandler;
