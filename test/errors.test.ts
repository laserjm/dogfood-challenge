// Copy to test/errors.test.ts. CONVENTIONS.md, Errors: every module's errors.ts lists all of its
// error classes, each with a literal `name`, so an adapter's exhaustive `switch` sees each one. A
// class left out of the list would pass the compiler and reach the user as a bug.
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const modulesDir = path.resolve(import.meta.dirname, "../modules")
const withErrors = existsSync(modulesDir)
  ? readdirSync(modulesDir).filter((name) =>
      existsSync(path.join(modulesDir, name, "errors.ts"))
    )
  : []

const isErrorClass = (value: unknown): value is new (...args: never[]) => Error =>
  typeof value === "function" && value.prototype instanceof Error

// A project without an errors.ts yet still has one test, so the file doesn't fail as empty.
if (withErrors.length === 0) it.skip("no module has an errors.ts yet", () => {})

describe.each(withErrors)("modules/%s/errors.ts", (name) => {
  it("lists every error class it exports, each named after its class", async () => {
    const exports: Record<string, unknown> = await import(`../modules/${name}/errors.ts`)
    const lists = Object.entries(exports).filter(
      ([key, value]) => key.endsWith("Errors") && Array.isArray(value)
    )
    expect(lists, "one `<noun>Errors` list").toHaveLength(1)
    const list = lists[0]?.[1]
    const listed: unknown[] = Array.isArray(list) ? list : []

    const classes = Object.entries(exports).filter(([, value]) => isErrorClass(value))
    for (const [exportName, type] of classes) {
      expect(listed, exportName).toContain(type)
      if (!isErrorClass(type)) continue
      // The literal `name` is what an adapter switches on. Arrays stand in for any constructor
      // argument: they print in a message and join like a list.
      expect(Reflect.construct(type, [["a"], ["b"], ["c"]]).name).toBe(exportName)
    }
    expect(listed).toHaveLength(classes.length)
  })
})
