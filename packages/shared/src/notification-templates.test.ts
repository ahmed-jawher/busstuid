import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TEMPLATES, renderNotification } from './notification-templates';

describe('renderNotification', () => {
  it('renders every template in both languages', () => {
    for (const key of NOTIFICATION_TEMPLATES) {
      for (const locale of ['ar', 'en'] as const) {
        const out = renderNotification(
          key,
          {
            student: 'S',
            vehicle: 'V',
            stop: 'P',
            time: '07:00',
            tripName: 'T',
            driverPhone: '+97336000000',
            minutesLate: 20,
            organization: 'O',
          },
          locale,
        );
        expect(out.title.length).toBeGreaterThan(0);
        expect(out.body).not.toContain('undefined');
      }
    }
  });

  it('uses the texts from PLAN §8', () => {
    expect(
      renderNotification('boarded', { student: 'سارة', vehicle: 'B 1', time: '6:42' }, 'ar').body,
    ).toBe('✅ صعد سارة إلى B 1 الساعة 6:42');
    expect(renderNotification('resolved', { student: 'سارة' }, 'ar').body).toBe(
      '✔️ تم التأكد من سلامة سارة',
    );
  });

  it('adds the emergency number when escalated', () => {
    const out = renderNotification(
      'student_left_onboard',
      { student: 'S', vehicle: 'V', driverPhone: 'P', emergencyNumber: '999' },
      'ar',
    );
    expect(out.body).toContain('999');
  });
});
