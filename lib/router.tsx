import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const ROUTES = ["/", "/cabinet", "/add", "/ask", "/history", "/settings"] as const;
export type RoutePath = (typeof ROUTES)[number];

export const ROUTE_TITLE: Record<RoutePath, string> = {
  "/": "今日用药",
  "/cabinet": "我的药箱",
  "/add": "添加药品",
  "/ask": "用药问答",
  "/history": "服药记录",
  "/settings": "设置",
};

// 静态托管对深路径不做 index.html 回退，直接访问 /add 会 404，
// 因此路由放在 hash 里，任何入口都落在 "/"，刷新与分享链接都可用。
function readLocation(): { path: RoutePath; search: string } {
  const hash = window.location.hash.replace(/^#/, "");
  const [rawPath, rawQuery = ""] = hash.split("?");
  const normalized = rawPath.replace(/\/+$/, "") || "/";
  const path = (ROUTES as readonly string[]).includes(normalized) ? (normalized as RoutePath) : "/";
  return { path, search: rawQuery ? `?${rawQuery}` : window.location.search };
}

interface RouterValue {
  path: RoutePath;
  query: URLSearchParams;
  navigate: (to: RoutePath, opts?: { replace?: boolean; query?: Record<string, string> }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  const navigate = useCallback<RouterValue["navigate"]>((to, opts) => {
    const qs = opts?.query ? `?${new URLSearchParams(opts.query).toString()}` : "";
    const url = `/#${to}${qs}`;
    if (opts?.replace) window.history.replaceState({ path: to }, "", url);
    else window.history.pushState({ path: to }, "", url);
    setLoc({ path: to, search: qs });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const value = useMemo<RouterValue>(
    () => ({ path: loc.path, query: new URLSearchParams(loc.search), navigate }),
    [loc, navigate],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter 必须在 RouterProvider 内使用");
  return ctx;
}