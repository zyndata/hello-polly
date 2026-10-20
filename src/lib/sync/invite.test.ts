import { describe, expect, it } from 'vitest';
import { joinFileId } from './invite';

const ID = '1AbC-dEf_GhIjKlMnOpQrStUvWxYz0123';

describe('joinFileId', () => {
  it('takes the file id out of an invitation link, wherever the app is served', () => {
    expect(joinFileId(`https://hellopolly.gorny.dev/#/join/${ID}`)).toBe(ID);
    expect(joinFileId(`  http://localhost:8081/#/join/${ID}\n`)).toBe(ID);
    expect(joinFileId(`Otwórz: https://hellopolly.gorny.dev/#/join/${ID} (przycisk…)`)).toBe(ID);
  });

  it('accepts a bare file id', () => {
    expect(joinFileId(ID)).toBe(ID);
  });

  it('rejects anything else', () => {
    expect(joinFileId('')).toBeUndefined();
    expect(joinFileId('https://hellopolly.gorny.dev/#/parent')).toBeUndefined();
    expect(joinFileId('https://drive.google.com/file/d/abc/view')).toBeUndefined();
    expect(joinFileId('#/join/%E0%A4%A')).toBeUndefined();
    expect(joinFileId('short')).toBeUndefined();
  });
});
