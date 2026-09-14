// vitest runs with globals: false, so testing-library's automatic cleanup
// never registers and renders accumulate across tests in a file.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);
