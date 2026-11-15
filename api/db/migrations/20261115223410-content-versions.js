"use strict";

// El contenido desde el panel (bloque 5, paso 4):
// - question_versions: cada versión de cada pregunta, entera. questions sigue siendo lo que ven los
//   alumnos (la copia de la versión publicada) y suma `version`, el número de esa versión.
// - question_reviews: cada aprobación o rechazo, con quién y el comentario.
// - teacher_products: qué cursos da cada docente (solo ve y edita el contenido de esos).
// - La versión que vio el alumno queda en answers y en las preguntas del examen, el desafío y el
//   repaso: se juega y se corrige con esa, aunque después se apruebe otra.
// Las preguntas que ya existen quedan con su versión 1.

const PLAYED = ["answers", "exam_attempt_questions", "challenge_attempt_questions", "daily_review_questions"];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await queryInterface.createTable(
        "question_versions",
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal("gen_random_uuid()") },
          question_id: { type: Sequelize.UUID, allowNull: false, references: { model: "questions", key: "id" }, onDelete: "CASCADE" },
          number: { type: Sequelize.INTEGER, allowNull: false },
          // published: la que ven los alumnos (o vieron, si se despublicó); replaced: una publicada que quedó vieja
          status: { type: Sequelize.ENUM("draft", "in_review", "rejected", "published", "replaced"), allowNull: false, defaultValue: "draft" },
          type: { type: Sequelize.ENUM("output", "fill_blank", "order_lines", "multiple_choice"), allowNull: false },
          difficulty: { type: Sequelize.ENUM("easy", "medium", "hard"), allowNull: false },
          topic: { type: Sequelize.STRING(60), allowNull: false },
          module: { type: Sequelize.INTEGER, allowNull: true },
          prompt: { type: Sequelize.TEXT, allowNull: false },
          content: { type: Sequelize.JSONB, allowNull: false },
          answer: { type: Sequelize.JSONB, allowNull: false },
          explanation: { type: Sequelize.TEXT, allowNull: false },
          author_id: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onDelete: "SET NULL" },
          submitted_at: { type: Sequelize.DATE, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
        },
        { transaction }
      );
      await queryInterface.addConstraint("question_versions", {
        fields: ["question_id", "number"],
        type: "unique",
        name: "question_versions_question_number_unique",
        transaction,
      });
      await queryInterface.addConstraint("question_versions", {
        fields: ["number"],
        type: "check",
        where: { number: { [Sequelize.Op.gte]: 1 } },
        name: "question_versions_number_positive",
        transaction,
      });
      // Una sola versión abierta (borrador, en revisión o rechazada) y una sola publicada por pregunta
      await q(`CREATE UNIQUE INDEX question_versions_one_open ON question_versions (question_id)
               WHERE status IN ('draft', 'in_review', 'rejected')`);
      await q(`CREATE UNIQUE INDEX question_versions_one_published ON question_versions (question_id)
               WHERE status = 'published'`);
      await q(`CREATE INDEX question_versions_status ON question_versions (status)`);

      await queryInterface.createTable(
        "question_reviews",
        {
          id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal("gen_random_uuid()") },
          version_id: { type: Sequelize.UUID, allowNull: false, references: { model: "question_versions", key: "id" }, onDelete: "CASCADE" },
          reviewer_id: { type: Sequelize.UUID, allowNull: true, references: { model: "users", key: "id" }, onDelete: "SET NULL" },
          decision: { type: Sequelize.ENUM("approved", "rejected"), allowNull: false },
          comment: { type: Sequelize.TEXT, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
        },
        { transaction }
      );
      // Rechazar exige un comentario
      await q(`ALTER TABLE question_reviews ADD CONSTRAINT question_reviews_reject_comment
               CHECK (decision = 'approved' OR length(trim(comment)) > 0)`);
      await queryInterface.addIndex("question_reviews", ["version_id"], { name: "question_reviews_version", transaction });

      await queryInterface.createTable(
        "teacher_products",
        {
          user_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, references: { model: "users", key: "id" }, onDelete: "CASCADE" },
          product_id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, references: { model: "products", key: "id" }, onDelete: "CASCADE" },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
        },
        { transaction }
      );

      // La versión publicada de cada pregunta (vacía si nunca se publicó)
      await queryInterface.addColumn("questions", "version", { type: Sequelize.INTEGER, allowNull: true }, { transaction });

      // Las preguntas que ya existen: su contenido es la versión 1
      await q(`INSERT INTO question_versions (question_id, number, status, type, difficulty, topic, module, prompt,
                 content, answer, explanation, author_id, created_at, updated_at)
               SELECT id, 1, status::text::enum_question_versions_status, type::text::enum_question_versions_type,
                      difficulty::text::enum_question_versions_difficulty, topic, module, prompt, content, answer,
                      explanation, author_id, created_at, updated_at
                 FROM questions`);
      await q(`UPDATE questions SET version = 1 WHERE status = 'published'`);

      // Con qué versión jugó el alumno. Lo que ya se jugó fue con la 1
      for (const table of PLAYED) {
        await queryInterface.addColumn(table, "question_version", { type: Sequelize.INTEGER, allowNull: true }, { transaction });
        await q(`UPDATE ${table} SET question_version = 1`);
        await queryInterface.changeColumn(table, "question_version", { type: Sequelize.INTEGER, allowNull: false }, { transaction });
        // La base no deja anotar una versión que no existe
        await q(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_question_version_fkey
                 FOREIGN KEY (question_id, question_version) REFERENCES question_versions (question_id, number)`);
        // Para saber rápido si alguien jugó una versión (revertir una aprobación) y contar respuestas
        await queryInterface.addIndex(table, ["question_id", "question_version"], {
          name: `${table}_question_version`,
          transaction,
        });
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of PLAYED) {
        await queryInterface.removeIndex(table, `${table}_question_version`, { transaction });
        await queryInterface.removeConstraint(table, `${table}_question_version_fkey`, { transaction });
        await queryInterface.removeColumn(table, "question_version", { transaction });
      }
      await queryInterface.removeColumn("questions", "version", { transaction });
      await queryInterface.dropTable("teacher_products", { transaction });
      await queryInterface.dropTable("question_reviews", { transaction });
      await queryInterface.dropTable("question_versions", { transaction });
      for (const type of [
        "enum_question_reviews_decision",
        "enum_question_versions_status",
        "enum_question_versions_type",
        "enum_question_versions_difficulty",
      ]) {
        await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${type}";`, { transaction });
      }
    });
  },
};
