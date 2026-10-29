import type { BadgeType } from '../types.ts';

export type CommandName =
  | 'sr'
  | 'song'
  | 'queue'
  | 'help'
  | 'vol'
  | 'voteskip'
  | 'skip'
  | 'veto'
  | 'clearqueue'
  | 'pause'
  | 'resume'
  | 'blacklist'
  | 'streamplaylist'
  | 'timer'
  | 'wrongsong';

export interface CommandDefinition {
  name: CommandName;
  aliases?: string[];
  defaultPermissions: BadgeType[];
  defaultCooldownSeconds?: number;
}

const ALL_ROLES: BadgeType[] = ['viewer', 'subscriber', 'vip', 'moderator', 'broadcaster'];
const MOD_ROLES: BadgeType[] = ['moderator', 'broadcaster'];

export const COMMANDS: CommandDefinition[] = [
  { name: 'sr', aliases: ['songrequest'], defaultPermissions: ALL_ROLES },
  { name: 'song', aliases: ['np', 'current'], defaultPermissions: ALL_ROLES },
  { name: 'queue', defaultPermissions: ALL_ROLES },
  { name: 'help', defaultPermissions: ALL_ROLES },
  { name: 'voteskip', defaultPermissions: ALL_ROLES },
  { name: 'vol', defaultPermissions: MOD_ROLES },
  { name: 'skip', defaultPermissions: MOD_ROLES },
  { name: 'veto', defaultPermissions: MOD_ROLES },
  { name: 'clearqueue', defaultPermissions: MOD_ROLES },
  { name: 'pause', defaultPermissions: MOD_ROLES },
  { name: 'resume', defaultPermissions: MOD_ROLES },
  { name: 'timer', defaultPermissions: MOD_ROLES },
  { name: 'blacklist', defaultPermissions: MOD_ROLES },
  { name: 'wrongsong', aliases: ['undo', 'oops'], defaultPermissions: ALL_ROLES },
  { name: 'streamplaylist', aliases: ['playlist', 'spl', 'addplaylist'], defaultPermissions: MOD_ROLES }
];

const lookup = new Map<string, CommandDefinition>();
for (const def of COMMANDS) {
  lookup.set(def.name, def);
  for (const alias of def.aliases || []) {
    lookup.set(alias, def);
  }
}

export function parseCommand(message: string): { definition: CommandDefinition; rawName: string; args: string } | null {
  const match = message.trim().match(/^!([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;

  const rawName = match[1].toLowerCase();
  const def = lookup.get(rawName);
  if (!def) return null;

  return { definition: def, rawName, args: (match[2] || '').trim() };
}

export function commandDefaultAllows(definition: CommandDefinition, badge: BadgeType): boolean {
  return definition.defaultPermissions.includes(badge);
}
