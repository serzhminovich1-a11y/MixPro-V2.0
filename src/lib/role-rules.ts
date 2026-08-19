// Single source of truth for "what can this staff role do" copy — shown
// both on the team-management page (everyone's roster) and on a staff
// member's own profile (their personal "Правила" section). Keep these two
// call sites reading from here rather than duplicating the wording, or
// they'll drift apart the next time a permission changes.

export const ROLE_ORDER = ["super_admin", "admin", "moderator", "teacher"] as const;
export type StaffRole = (typeof ROLE_ORDER)[number];

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Супер-админ",
  admin: "Админ",
  moderator: "Модератор",
  teacher: "Преподаватель",
};

export const ROLE_DOT: Record<string, string> = {
  super_admin: "bg-pink-400",
  admin: "bg-violet",
  moderator: "bg-cyan",
  teacher: "bg-orange-300",
};

export const ROLE_RULES: Record<StaffRole, { can: string[]; cannot: string[] }> = {
  super_admin: {
    can: [
      "Всё, что может админ, плюс управление ролями всех уровней (включая выдачу супер-админа)",
      "Видит выручку и аналитику по подпискам (/admin/subscriptions)",
      "Выдаёт/снимает доп. права «Команды» — доступ к финансам и ко всем курсам",
    ],
    cannot: ["Ничего не ограничено — это высший уровень доступа"],
  },
  admin: {
    can: [
      "Управляет пользователями: роли (кроме супер-админа), баны, XP, сертификаты, верификация",
      "Редактирует курсы, уроки и глоссарий, библиотеку лупов, категории форума",
      "Модерирует форум и жалобы, видит журнал действий",
    ],
    cannot: [
      "Не может выдать/снять роль супер-админа",
      "Не видит выручку и аналитику по подпискам, если это право не выдано отдельно",
    ],
  },
  moderator: {
    can: [
      "Модерирует форум и жалобы, видит журнал действий",
      "Редактирует курсы и уроки, управляет категориями форума",
    ],
    cannot: [
      "Не редактирует глоссарий и библиотеку лупов — это только с рангом «админ»",
      "Не управляет пользователями (роли, баны, XP, сертификаты)",
      "Не видит выручку и аналитику",
    ],
  },
  teacher: {
    can: ["Создаёт и редактирует свои собственные курсы и уроки"],
    cannot: [
      "Не может редактировать чужие курсы/уроки (если не выдано право «Все курсы»)",
      "Не модерирует форум, не видит жалобы",
      "Не управляет пользователями и не видит выручку",
    ],
  },
};

/** Extra staff_permissions flags a super-admin can grant on top of a role —
 * shown as additional bullet lines wherever a person has them. */
export const EXTRA_PERMISSION_LABEL: Record<"canManageCourses" | "canViewFinances", string> = {
  canManageCourses: "Дополнительно: право «Все курсы» — можно редактировать курсы и уроки других авторов, не только свои",
  canViewFinances: "Дополнительно: право «Финансы» — открыта страница выручки и аналитики по подпискам",
};
