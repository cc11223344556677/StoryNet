import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../app/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "u@example.com", display_name: "User" },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    refreshProfile: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn()
  }),
  RequireAuth: ({ children }: { children: any }) => children,
  PublicOnlyRoute: ({ children }: { children: any }) => children
}));

vi.mock("../features/projects/ProjectsPage", () => ({
  ProjectsPage: () => <div>Projects Page</div>
}));
vi.mock("../features/graph/ProjectGraphPage", () => ({
  ProjectGraphPage: () => <div>Graph Workspace Page</div>
}));
vi.mock("../features/documents/DocumentsPage", () => ({
  DocumentsPage: () => <div>Documents Page</div>
}));
vi.mock("../features/documents/JobsPage", () => ({
  JobsPage: () => <div>Jobs Page</div>
}));
vi.mock("../features/auth/LoginPage", () => ({
  LoginPage: () => <div>Login Page</div>
}));
vi.mock("../features/auth/RegisterPage", () => ({
  RegisterPage: () => <div>Register Page</div>
}));
vi.mock("../features/auth/ProfilePage", () => ({
  ProfilePage: () => <div>Profile Page</div>
}));

import { App } from "../app/App";

describe("project route redirect", () => {
  it("redirects /projects/:id to /projects/:id/graph", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/project-1"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText("Graph Workspace Page")).toBeInTheDocument();
  });
});
