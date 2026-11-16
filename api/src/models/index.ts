import { User } from "./User.js";
import { PasswordToken } from "./PasswordToken.js";
import { Product } from "./Product.js";
import { Enrollment } from "./Enrollment.js";
import { ProcessedPayment } from "./ProcessedPayment.js";
import { Constellation } from "./Constellation.js";
import { Star } from "./Star.js";
import { Question } from "./Question.js";
import { Answer } from "./Answer.js";
import { StarCompletion } from "./StarCompletion.js";
import { XpEvent } from "./XpEvent.js";
import { ExamAttempt } from "./ExamAttempt.js";
import { ExamAttemptQuestion } from "./ExamAttemptQuestion.js";
import { Coupon } from "./Coupon.js";
import { CouponVoid } from "./CouponVoid.js";
import { DailyActivity } from "./DailyActivity.js";
import { DailyReview } from "./DailyReview.js";
import { DailyReviewQuestion } from "./DailyReviewQuestion.js";
import { Challenge } from "./Challenge.js";
import { ChallengeAttempt } from "./ChallengeAttempt.js";
import { ChallengeAttemptQuestion } from "./ChallengeAttemptQuestion.js";
import { GlintEvent } from "./GlintEvent.js";
import { StreakBadge } from "./StreakBadge.js";
import { UserCosmetic } from "./UserCosmetic.js";
import { Role } from "./Role.js";
import { RolePermission } from "./RolePermission.js";
import { AuditLog } from "./AuditLog.js";
import { Setting } from "./Setting.js";
import { ShopItem } from "./ShopItem.js";
import { QuestionVersion } from "./QuestionVersion.js";
import { QuestionReview } from "./QuestionReview.js";
import { TeacherProduct } from "./TeacherProduct.js";
import { Notification } from "./Notification.js";

User.hasMany(PasswordToken, { foreignKey: "userId" });
PasswordToken.belongsTo(User, { foreignKey: "userId" });

User.hasMany(Enrollment, { foreignKey: "userId" });
Enrollment.belongsTo(User, { foreignKey: "userId" });

Product.hasMany(Enrollment, { foreignKey: "productId" });
Enrollment.belongsTo(Product, { foreignKey: "productId" });

Product.hasOne(Constellation, { foreignKey: "productId" });
Constellation.belongsTo(Product, { foreignKey: "productId" });

Constellation.hasMany(Star, { foreignKey: "constellationId" });
Star.belongsTo(Constellation, { foreignKey: "constellationId" });

Product.hasMany(Question, { foreignKey: "productId" });
Question.belongsTo(Product, { foreignKey: "productId" });

Star.hasMany(Question, { foreignKey: "starId" });
Question.belongsTo(Star, { foreignKey: "starId" });

User.hasMany(Answer, { foreignKey: "userId" });
Answer.belongsTo(User, { foreignKey: "userId" });

Question.hasMany(Answer, { foreignKey: "questionId" });
Answer.belongsTo(Question, { foreignKey: "questionId" });

User.hasMany(StarCompletion, { foreignKey: "userId" });
StarCompletion.belongsTo(User, { foreignKey: "userId" });

Star.hasMany(StarCompletion, { foreignKey: "starId" });
StarCompletion.belongsTo(Star, { foreignKey: "starId" });

User.hasMany(XpEvent, { foreignKey: "userId" });
XpEvent.belongsTo(User, { foreignKey: "userId" });

User.hasMany(ExamAttempt, { foreignKey: "userId" });
ExamAttempt.belongsTo(User, { foreignKey: "userId" });

Star.hasMany(ExamAttempt, { foreignKey: "starId" });
ExamAttempt.belongsTo(Star, { foreignKey: "starId" });

ExamAttempt.hasMany(ExamAttemptQuestion, { foreignKey: "attemptId" });
ExamAttemptQuestion.belongsTo(ExamAttempt, { foreignKey: "attemptId" });

Question.hasMany(ExamAttemptQuestion, { foreignKey: "questionId" });
ExamAttemptQuestion.belongsTo(Question, { foreignKey: "questionId" });

User.hasMany(Coupon, { foreignKey: "userId" });
Coupon.belongsTo(User, { foreignKey: "userId" });

Constellation.hasMany(Coupon, { foreignKey: "constellationId" });
Coupon.belongsTo(Constellation, { foreignKey: "constellationId" });

ExamAttempt.hasOne(Coupon, { foreignKey: "examAttemptId" });
Coupon.belongsTo(ExamAttempt, { foreignKey: "examAttemptId" });

Coupon.hasOne(CouponVoid, { foreignKey: "couponId" });
CouponVoid.belongsTo(Coupon, { foreignKey: "couponId" });

User.hasMany(DailyActivity, { foreignKey: "userId" });
DailyActivity.belongsTo(User, { foreignKey: "userId" });

User.hasMany(DailyReview, { foreignKey: "userId" });
DailyReview.belongsTo(User, { foreignKey: "userId" });

DailyReview.hasMany(DailyReviewQuestion, { foreignKey: "reviewId" });
DailyReviewQuestion.belongsTo(DailyReview, { foreignKey: "reviewId" });

Question.hasMany(DailyReviewQuestion, { foreignKey: "questionId" });
DailyReviewQuestion.belongsTo(Question, { foreignKey: "questionId" });

Challenge.hasMany(ChallengeAttempt, { foreignKey: "challengeId" });
ChallengeAttempt.belongsTo(Challenge, { foreignKey: "challengeId" });

User.hasMany(ChallengeAttempt, { foreignKey: "userId" });
ChallengeAttempt.belongsTo(User, { foreignKey: "userId" });

ChallengeAttempt.hasMany(ChallengeAttemptQuestion, { foreignKey: "attemptId" });
ChallengeAttemptQuestion.belongsTo(ChallengeAttempt, { foreignKey: "attemptId" });

Question.hasMany(ChallengeAttemptQuestion, { foreignKey: "questionId" });
ChallengeAttemptQuestion.belongsTo(Question, { foreignKey: "questionId" });
User.hasMany(GlintEvent, { foreignKey: "userId" });
GlintEvent.belongsTo(User, { foreignKey: "userId" });

User.hasMany(StreakBadge, { foreignKey: "userId" });
StreakBadge.belongsTo(User, { foreignKey: "userId" });
User.hasMany(UserCosmetic, { foreignKey: "userId" });
UserCosmetic.belongsTo(User, { foreignKey: "userId" });

Role.hasMany(User, { foreignKey: "roleId" });
User.belongsTo(Role, { foreignKey: "roleId" });

Role.hasMany(RolePermission, { foreignKey: "roleId" });
RolePermission.belongsTo(Role, { foreignKey: "roleId" });

Question.hasMany(QuestionVersion, { foreignKey: "questionId" });
QuestionVersion.belongsTo(Question, { foreignKey: "questionId" });
QuestionVersion.belongsTo(User, { foreignKey: "authorId", as: "Author" });
QuestionVersion.hasMany(QuestionReview, { foreignKey: "versionId" });
QuestionReview.belongsTo(QuestionVersion, { foreignKey: "versionId" });
QuestionReview.belongsTo(User, { foreignKey: "reviewerId", as: "Reviewer" });
User.hasMany(TeacherProduct, { foreignKey: "userId" });
TeacherProduct.belongsTo(Product, { foreignKey: "productId" });

// Toda pregunta nace con su versión 1, con lo mismo que la fila (publicada si se crea publicada).
// Así load-content y los tests no tienen que acordarse. El panel crea la suya a mano (hooks: false)
Question.afterCreate(async (question, options) => {
  const published = question.status === "published";
  await QuestionVersion.create(
    {
      questionId: question.id,
      number: 1,
      status: published ? "published" : "draft",
      type: question.type,
      difficulty: question.difficulty,
      topic: question.topic,
      module: question.module ?? null,
      prompt: question.prompt,
      content: question.content,
      answer: question.answer,
      explanation: question.explanation,
      authorId: question.authorId ?? null,
    },
    { transaction: options.transaction }
  );
  if (published) await question.update({ version: 1 }, { transaction: options.transaction, hooks: false });
});

export { User, PasswordToken, Product, Enrollment, ProcessedPayment, Constellation, Star, Question, Answer, StarCompletion, XpEvent, ExamAttempt, ExamAttemptQuestion, Coupon, CouponVoid, DailyActivity, DailyReview, DailyReviewQuestion, Challenge, ChallengeAttempt, ChallengeAttemptQuestion, GlintEvent, StreakBadge, UserCosmetic, Role, RolePermission, AuditLog, Setting, ShopItem, QuestionVersion, QuestionReview, TeacherProduct, Notification };