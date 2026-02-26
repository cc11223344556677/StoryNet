import React, { Suspense, lazy, useMemo } from "react";
import { Alert, CircularProgress, Stack, Typography } from "@mui/material";
import { getGraphRendererDefinition } from "./registry";
import type { GraphRendererId, GraphRendererProps } from "./types";

interface GraphRendererHostProps extends GraphRendererProps {
  rendererId: GraphRendererId;
}

interface RendererErrorBoundaryProps {
  rendererLabel: string;
  children: React.ReactNode;
}

interface RendererErrorBoundaryState {
  error: Error | null;
}

class RendererErrorBoundary extends React.Component<RendererErrorBoundaryProps, RendererErrorBoundaryState> {
  constructor(props: RendererErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error };
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <Alert severity="error">
          Failed to load the {this.props.rendererLabel} renderer. {this.state.error.message}
        </Alert>
      );
    }

    return this.props.children;
  }
}

export function GraphRendererHost({
  rendererId,
  graph,
  selectedNodeId,
  selectedEdgeId,
  onNodeClick,
  onEdgeClick
}: GraphRendererHostProps): JSX.Element {
  const definition = getGraphRendererDefinition(rendererId);

  const RendererComponent = useMemo(() => lazy(definition.load), [definition]);

  return (
    <RendererErrorBoundary key={rendererId} rendererLabel={definition.label}>
      <Suspense
        fallback={
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={24} />
            <Typography>Loading {definition.label} renderer...</Typography>
          </Stack>
        }
      >
        <RendererComponent
          graph={graph}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
        />
      </Suspense>
    </RendererErrorBoundary>
  );
}
