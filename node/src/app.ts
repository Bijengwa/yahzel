import cors from "cors";
import express from "express";

import authRoutes from "./auth/auth.routes.js";
import departmentRoutes from "./departments/department.routes.js";
import hierarchyRoutes from "./hierarchy/hierarchy.routes.js";
import notificationRoutes from "./notifications/notification.routes.js";
import organisationRoutes from "./organisation/organisation.routes.js";
import profileRoutes from "./profile/profile.routes.js";
import referenceRoutes from "./reference.routes.js";
import workRoutes from "./work/work.routes.js";
import { UPLOAD_ROOT } from "./profile/profile.storage.js";

const app = express();

app.use(cors());
app.use(express.json());

// Uploaded profile pictures. Local disk for now — see profile.storage.ts.
app.use("/uploads", express.static(UPLOAD_ROOT, { maxAge: "1h" }));

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/organisations", organisationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/work", workRoutes);
app.use("/api/hierarchy", hierarchyRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/reference", referenceRoutes);

export default app;
