// Standard template set for dangol messaging.
// Kakao pre-registration status = PENDING (used as sms/email body until reviewed).

export type TemplateId =
  | "coupon_issued"
  | "stamp_reward"
  | "returning_reminder"
  | "churn_reengage"
  | "anniversary";

export interface Template {
  id: TemplateId;
  name: string;
  kakaoReviewStatus: "PENDING" | "APPROVED";
  // Returns message body with simple variable substitution
  body(vars: Record<string, string>): string;
}

function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

export const TEMPLATES: Record<TemplateId, Template> = {
  coupon_issued: {
    id: "coupon_issued",
    name: "쿠폰 발급",
    kakaoReviewStatus: "PENDING",
    body: (v) =>
      interpolate(
        "[{{storeName}}] 쿠폰이 발급되었습니다.\n혜택: {{benefit}}\n코드: {{couponCode}}\n유효기간: {{expiresAt}}",
        v
      ),
  },
  stamp_reward: {
    id: "stamp_reward",
    name: "스탬프 적립 리워드",
    kakaoReviewStatus: "PENDING",
    body: (v) =>
      interpolate(
        "[{{storeName}}] 스탬프 {{stampCount}}개 달성!\n리워드: {{reward}}\n감사합니다.",
        v
      ),
  },
  returning_reminder: {
    id: "returning_reminder",
    name: "재방문 안내",
    kakaoReviewStatus: "PENDING",
    body: (v) =>
      interpolate(
        "[{{storeName}}] 오랜만이에요 {{customerName}}님!\n재방문 쿠폰이 준비되어 있어요.",
        v
      ),
  },
  churn_reengage: {
    id: "churn_reengage",
    name: "이탈 고객 재유입",
    kakaoReviewStatus: "PENDING",
    body: (v) =>
      interpolate(
        "[{{storeName}}] {{customerName}}님, 보고 싶었어요!\n{{days}}일 만에 오시면 특별 혜택을 드려요.",
        v
      ),
  },
  anniversary: {
    id: "anniversary",
    name: "기념일 메시지",
    kakaoReviewStatus: "PENDING",
    body: (v) =>
      interpolate(
        "[{{storeName}}] {{customerName}}님, {{occasion}}을 축하드려요!\n특별한 날 저희와 함께해 주세요.",
        v
      ),
  },
};

export function getTemplate(id: TemplateId): Template {
  return TEMPLATES[id];
}
