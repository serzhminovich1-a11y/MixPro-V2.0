import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("/admin/courses routing", () => {
  const coursesSrc = read("src/routes/_authenticated/admin.courses.tsx");
  const indexSrc = read("src/routes/_authenticated/admin.index.tsx");
  const routeTree = read("src/routeTree.gen.ts");

  it("admin.courses.tsx declares the /_authenticated/admin/courses route", () => {
    expect(coursesSrc).toMatch(
      /createFileRoute\(\s*["']\/_authenticated\/admin\/courses["']\s*\)/,
    );
  });

  it("admin.courses.tsx renders the course editor component (not the users page)", () => {
    // Route's `component:` must render <CourseEditorPage/> (optionally wrapped,
    // e.g. in <RoleGate>) — the editor, not AdminPage/UsersPage.
    const start = coursesSrc.indexOf("component:");
    expect(start).toBeGreaterThan(-1);
    const componentBlock = coursesSrc.slice(start, start + 400);
    expect(componentBlock).toMatch(/<CourseEditorPage\b/);
    expect(coursesSrc).toMatch(/function\s+CourseEditorPage\b/);
    expect(componentBlock).not.toMatch(/<AdminPage\b/);
    expect(componentBlock).not.toMatch(/<UsersPage\b/);
  });

  it("admin.index.tsx is the leaf /admin route, not a parent that swallows /admin/courses", () => {
    // Must be the leaf `/_authenticated/admin/` route, and must NOT be `admin.tsx`
    // acting as a parent layout without an <Outlet />.
    expect(indexSrc).toMatch(
      /createFileRoute\(\s*["']\/_authenticated\/admin\/["']\s*\)/,
    );
  });

  it("generated route tree wires /admin/courses to AuthenticatedAdminCoursesRoute", () => {
    // The route tree must map the /admin/courses fullPath to the courses route,
    // and must import it from admin.courses (the course editor file).
    expect(routeTree).toMatch(
      /['"]\/admin\/courses['"]:\s*typeof\s+AuthenticatedAdminCoursesRoute/,
    );
    expect(routeTree).toMatch(
      /AuthenticatedAdminCoursesRouteImport[\s\S]*from\s+['"]\.\/routes\/_authenticated\/admin\.courses['"]/,
    );
    // And the courses route must be a direct child of _authenticated, not of admin.index.
    expect(routeTree).toMatch(
      /AuthenticatedAdminCoursesRoute\s*=\s*AuthenticatedAdminCoursesRouteImport\.update\(\s*\{[\s\S]*?getParentRoute:\s*\(\)\s*=>\s*AuthenticatedRouteRoute/,
    );
  });

  it("no legacy admin.tsx parent route exists that could shadow /admin/courses", () => {
    // If a bare `admin.tsx` were reintroduced without <Outlet />, /admin/courses
    // would render the users page instead of the editor. Guard against it.
    expect(() => read("src/routes/_authenticated/admin.tsx")).toThrow();
  });
});
