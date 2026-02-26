import { ReactNode, useEffect, useMemo, useRef } from "react";
import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from "react";
import { Box, Drawer } from "@mui/material";
import type { GraphWorkspaceLayoutState } from "./workspaceLayout";

const COLLAPSED_WIDTH = 56;
const MIN_CENTER_WIDTH = 460;
const MIN_LEFT_WIDTH = 280;
const MIN_RIGHT_WIDTH = 300;

interface GraphWorkspaceLayoutProps {
  isMobile: boolean;
  state: GraphWorkspaceLayoutState;
  setState: Dispatch<SetStateAction<GraphWorkspaceLayoutState>>;
  centerPane: ReactNode;
  leftPane: ReactNode;
  rightPane: ReactNode;
  leftCollapsedPane: ReactNode;
  rightCollapsedPane: ReactNode;
  mobileLeftOpen: boolean;
  mobileRightOpen: boolean;
  onMobileLeftOpenChange: (open: boolean) => void;
  onMobileRightOpenChange: (open: boolean) => void;
}

type ResizeSide = "left" | "right";

export function GraphWorkspaceLayout({
  isMobile,
  state,
  setState,
  centerPane,
  leftPane,
  rightPane,
  leftCollapsedPane,
  rightCollapsedPane,
  mobileLeftOpen,
  mobileRightOpen,
  onMobileLeftOpenChange,
  onMobileRightOpenChange
}: GraphWorkspaceLayoutProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const resizeSideRef = useRef<ResizeSide | null>(null);

  useEffect(() => {
    if (isMobile) {
      resizeSideRef.current = null;
      return;
    }

    const onMouseMove = (event: MouseEvent): void => {
      const resizeSide = resizeSideRef.current;
      if (!resizeSide || !rootRef.current) {
        return;
      }

      const rect = rootRef.current.getBoundingClientRect();
      const currentLeft = state.leftCollapsed ? COLLAPSED_WIDTH : state.leftWidth;
      const currentRight = state.rightCollapsed ? COLLAPSED_WIDTH : state.rightWidth;

      if (resizeSide === "left" && !state.leftCollapsed) {
        const maxLeft = Math.max(
          MIN_LEFT_WIDTH,
          rect.width - currentRight - MIN_CENTER_WIDTH
        );
        const nextWidth = Math.max(
          MIN_LEFT_WIDTH,
          Math.min(maxLeft, event.clientX - rect.left)
        );

        setState((previous) => ({ ...previous, leftWidth: Math.round(nextWidth) }));
      }

      if (resizeSide === "right" && !state.rightCollapsed) {
        const maxRight = Math.max(
          MIN_RIGHT_WIDTH,
          rect.width - currentLeft - MIN_CENTER_WIDTH
        );
        const nextWidth = Math.max(
          MIN_RIGHT_WIDTH,
          Math.min(maxRight, rect.right - event.clientX)
        );

        setState((previous) => ({ ...previous, rightWidth: Math.round(nextWidth) }));
      }
    };

    const onMouseUp = (): void => {
      resizeSideRef.current = null;
      window.document.body.style.cursor = "";
      window.document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.document.body.style.cursor = "";
      window.document.body.style.userSelect = "";
    };
  }, [isMobile, setState, state.leftCollapsed, state.leftWidth, state.rightCollapsed, state.rightWidth]);

  const onResizeStart = (side: ResizeSide) => (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (isMobile) {
      return;
    }

    resizeSideRef.current = side;
    window.document.body.style.cursor = "col-resize";
    window.document.body.style.userSelect = "none";
    event.preventDefault();
  };

  const desktopGridTemplate = useMemo(() => {
    const leftWidth = state.leftCollapsed ? COLLAPSED_WIDTH : state.leftWidth;
    const rightWidth = state.rightCollapsed ? COLLAPSED_WIDTH : state.rightWidth;
    return `${leftWidth}px 8px minmax(0, 1fr) 8px ${rightWidth}px`;
  }, [state.leftCollapsed, state.leftWidth, state.rightCollapsed, state.rightWidth]);

  if (isMobile) {
    return (
      <>
        <Box className="graph-workspace-mobile-center">{centerPane}</Box>
        <Drawer
          anchor="bottom"
          open={mobileLeftOpen}
          onClose={() => onMobileLeftOpenChange(false)}
          PaperProps={{ sx: { maxHeight: "70vh", borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
        >
          <Box sx={{ p: 1.5 }}>{leftPane}</Box>
        </Drawer>
        <Drawer
          anchor="bottom"
          open={mobileRightOpen}
          onClose={() => onMobileRightOpenChange(false)}
          PaperProps={{ sx: { maxHeight: "70vh", borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
        >
          <Box sx={{ p: 1.5 }}>{rightPane}</Box>
        </Drawer>
      </>
    );
  }

  return (
    <Box
      ref={rootRef}
      className="graph-workspace-grid"
      sx={{ gridTemplateColumns: desktopGridTemplate }}
    >
      <Box className="graph-workspace-sidebar">
        {state.leftCollapsed ? leftCollapsedPane : leftPane}
      </Box>
      <Box
        className="graph-workspace-resizer"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onResizeStart("left")}
      />
      <Box className="graph-workspace-center">{centerPane}</Box>
      <Box
        className="graph-workspace-resizer"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onResizeStart("right")}
      />
      <Box className="graph-workspace-sidebar">
        {state.rightCollapsed ? rightCollapsedPane : rightPane}
      </Box>
    </Box>
  );
}
