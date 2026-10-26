import { User } from "./User.js";
import { PasswordToken } from "./PasswordToken.js";

User.hasMany(PasswordToken, { foreignKey: "userId" });
PasswordToken.belongsTo(User, { foreignKey: "userId" });

export { User, PasswordToken };