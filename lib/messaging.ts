// SP-5에서 실제 발송 구현 예정 (Solapi 연동).
// 현재는 인터페이스만 정의하고 no-op 반환.

export async function sendCoupon(
  couponId: string // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<{ queued: true }> {
  // TODO: implemented in SP-5 (Solapi)
  return { queued: true };
}
