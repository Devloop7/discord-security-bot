// src/core/modguard.js — pre-action safety checks for ban/kick/mute.
// target is a GuildMember (or null if the user isn't in the guild).
function checkActable({ interaction, target, action }) {
  const guild = interaction.guild;
  const me = guild.members.me;
  if (!target) return { ok: false, reason: `That user isn't in this server.` };
  if (target.id === interaction.user.id) return { ok: false, reason: `You can't ${action} yourself.` };
  if (target.id === guild.ownerId) return { ok: false, reason: `You can't ${action} the server owner.` };
  if (target.id === me.id) return { ok: false, reason: `I can't ${action} myself.` };
  if (me.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return { ok: false, reason: `My role isn't high enough to ${action} ${target.user.tag}. Move my role above theirs in Server Settings → Roles.` };
  }
  if (interaction.user.id !== guild.ownerId &&
      interaction.member.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return { ok: false, reason: `You can't ${action} someone whose top role is equal to or higher than yours.` };
  }
  return { ok: true };
}
module.exports = { checkActable };
