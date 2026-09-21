import type { Tx } from '../database/prisma.service';

/**
 * Removes a child's personal data (PLAN §14): photo deleted, consent withdrawn, pending requests
 * cancelled, unlinked from every organisation, and names anonymised. Trip events and alerts stay
 * (legal and safety records) but no longer carry the child's name or face.
 * If other guardians remain, only `guardianId`'s link is removed and the child is untouched.
 * Runs on the system role.
 */
export async function removeChildForGuardian(
  tx: Tx,
  studentId: string,
  guardianId: string,
  now = new Date(),
): Promise<'unlinked' | 'deleted'> {
  const guardians = await tx.studentGuardian.count({ where: { studentId } });
  if (guardians > 1) {
    await tx.studentGuardian.delete({
      where: { studentId_guardianUserId: { studentId, guardianUserId: guardianId } },
    });
    return 'unlinked';
  }
  await tx.studentPhoto.deleteMany({ where: { studentId } });
  await tx.consent.updateMany({
    where: { studentId, withdrawnAt: null },
    data: { withdrawnAt: now },
  });
  await tx.enrollmentRequest.updateMany({
    where: { studentId, status: 'pending' },
    data: { status: 'cancelled', decidedAt: now },
  });
  await tx.orgStudent.updateMany({
    where: { studentId, status: 'active' },
    data: { status: 'removed', removedAt: now },
  });
  await tx.routeStudent.updateMany({
    where: { studentId, activeTo: null },
    data: { activeTo: now },
  });
  await tx.student.update({
    where: { id: studentId },
    data: {
      deletedAt: now,
      fullNameAr: 'طالب محذوف',
      fullNameEn: null,
      notes: null,
      schoolName: '—',
      photoVersion: 0,
    },
  });
  return 'deleted';
}
