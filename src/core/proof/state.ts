import type { SealRecord } from './record';

// Badge state is a pure function of two ORTHOGONAL dimensions, not a single enum:
//   - confirmation (Pending | Sealed) comes from the proof record
//   - match (Matched | Drifted) compares the baseline hash to the current bytes' hash
// They can co-occur, e.g. "Pending · Drifted". (ARCHITECTURE 4.7)

export type ConfirmationState = 'Pending' | 'Sealed';
export type ContentMatch = 'Matched' | 'Drifted';

export interface BadgeState {
  sealed: boolean;
  confirmation: ConfirmationState;
  match: ContentMatch;
  label: string;
}

export function deriveBadge(record: SealRecord, currentContentHashHex: string): BadgeState {
  const confirmation: ConfirmationState = record.confirmation === 'sealed' ? 'Sealed' : 'Pending';
  const match: ContentMatch = currentContentHashHex === record.contentHash ? 'Matched' : 'Drifted';
  const parts: string[] = [confirmation];
  if (match === 'Drifted') parts.push('Drifted');
  if (confirmation === 'Sealed' && record.bitcoinBlock) parts.push(`block ${record.bitcoinBlock}`);
  return { sealed: confirmation === 'Sealed', confirmation, match, label: parts.join(' · ') };
}
