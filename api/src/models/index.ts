import { User } from "./User.js";
import { PasswordToken } from "./PasswordToken.js";
import { Product } from "./Product.js";
import { Enrollment } from "./Enrollment.js";
import { ProcessedPayment } from "./ProcessedPayment.js";

User.hasMany(PasswordToken, { foreignKey: "userId" });
PasswordToken.belongsTo(User, { foreignKey: "userId" });

User.hasMany(Enrollment, { foreignKey: "userId" });
Enrollment.belongsTo(User, { foreignKey: "userId" });

Product.hasMany(Enrollment, { foreignKey: "productId" });
Enrollment.belongsTo(Product, { foreignKey: "productId" });

export { User, PasswordToken, Product, Enrollment, ProcessedPayment };