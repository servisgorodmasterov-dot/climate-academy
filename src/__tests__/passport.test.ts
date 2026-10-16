import { describe, expect, it } from 'vitest';
import { localPassport, permissions, validateFile } from '../passport/passport';

describe('Права доступа к паспорту', () => {
  it('мастер не видит чеки жильца и не создаёт их', () => {
    expect(permissions.canView('master', { category: 'receipt' })).toBe(false);
    expect(permissions.canCreate('master', 'receipt')).toBe(false);
    expect(permissions.canView('resident', { category: 'receipt' })).toBe(true);
  });
  it('жилец не удаляет фото скрытых работ мастера; администратор — может', () => {
    expect(permissions.canDelete('resident', { authorRole: 'master', category: 'hidden_work' })).toBe(false);
    expect(permissions.canDelete('admin', { authorRole: 'master', category: 'hidden_work' })).toBe(true);
    expect(permissions.canDelete('resident', { authorRole: 'resident', category: 'repair_photo' })).toBe(true);
  });
  it('проверяет тип и размер файлов', () => {
    expect(validateFile({ type: 'image/jpeg', size: 1000, name: 'a.jpg' })).toBeNull();
    expect(validateFile({ type: 'application/x-msdownload', size: 10, name: 'a.exe' })).toContain('допустимы');
    expect(validateFile({ type: 'application/pdf', size: 16 * 1024 * 1024, name: 'a.pdf' })).toContain('15 МБ');
  });
});

describe('Хранилище паспорта (IndexedDB)', () => {
  it('сохраняет запись с файлом, читает и удаляет', async () => {
    const blob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
    const e = await localPassport.add({ apartmentId: 'apt-test', roomId: 'bath', category: 'act', zone: '', title: 'Акт', description: '', authorRole: 'master' }, [{ blob, name: 'act.pdf' }]);
    const list = await localPassport.list('apt-test');
    expect(list.map((x) => x.id)).toContain(e.id);
    expect(list[0].files[0]).toMatchObject({ name: 'act.pdf', mime: 'application/pdf' });
    expect(await localPassport.file(e.files[0].id)).toBeTruthy();
    await localPassport.remove(e.id);
    expect(await localPassport.list('apt-test')).toHaveLength(0);
    expect(await localPassport.file(e.files[0].id)).toBeUndefined();
  });
});
