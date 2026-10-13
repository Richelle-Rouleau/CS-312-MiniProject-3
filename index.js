import express from "express";
import "dotenv/config";
import methodOverride from "method-override";
import session from "express-session";
import pool from "./db.js";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is missing from .env");
}

const app = express();
const port = 3000;

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

function requireSignIn(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/signin");
  }

  next();
}

app.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        b.blog_id AS id,
        COALESCE(
        NULLIF(u.name, ''),
        NULLIF(b.creator_name, ''),
        'Unknown'
        ) AS auther,
        u.name AS auther,
        b.creator_user_id,
        b.title,
        b.body AS content,
        TO_CHAR(
          b.date_created,
          'YYYY-MM-DD HH24:MI:SS'
        ) AS date
      FROM blogs b
      LEFT JOIN users u
        ON b.creator_user_id = u.user_id
      ORDER BY b.blog_id DESC
    `);

    res.render("index.ejs", {
      posts: result.rows,
      pageTitle: "Home",
      user: req.session.user ?? null,
    });
  } catch (err) {
    console.error("Error fetching blog posts:", err);
    res.status(500).send("Error fetching blog posts");
  }
});

app.get("/signup", (req, res) => {
  res.render("signup.ejs", {
    error: null,
    pageTitle: "Sign Up",
  });
});

app.post("/signup", async (req, res) => {
  const name = req.body.name?.trim();
  const password = req.body.password;

  if (!name || !password) {
    return res.status(400).render("signup.ejs", {
      error: "Please enter a name and password.",
      pageTitle: "Sign Up",
    });
  }

  try {
    const existing = await pool.query(
      `SELECT user_id
       FROM users
       WHERE LOWER(name) = LOWER($1)`,
      [name],
    );

    if (existing.rows.length > 0) {
      return res.status(409).render("signup.ejs", {
        error: "That name is already taken.",
        pageTitle: "Sign Up",
      });
    }

    const sequenceResult = await pool.query(
      "SELECT nextval('user_id_num_seq') AS number",
    );

    const userId = `user-${sequenceResult.rows[0].number}`;

    const result = await pool.query(
      `INSERT INTO users (user_id, name, password)
       VALUES ($1, $2, $3)
       RETURNING user_id, name`,
      [userId, name, password],
    );

    req.session.user = result.rows[0];
    res.redirect("/");
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).render("signup.ejs", {
        error: "That name is already taken.",
        pageTitle: "Sign Up",
      });
    }

    console.error("Error creating account:", err);
    res.status(500).send("Error creating account");
  }
});

app.get("/signin", (req, res) => {
  res.render("signin.ejs", {
    error: null,
    pageTitle: "Sign In",
  });
});

app.post("/signin", async (req, res) => {
  const name = req.body.name?.trim() ?? "";
  const password = req.body.password ?? "";

  try {
    const result = await pool.query(
      `SELECT user_id, name
       FROM users
       WHERE LOWER(name) = LOWER($1)
         AND password = $2`,
      [name, password],
    );

    if (result.rows.length === 0) {
      return res.status(401).render("signin.ejs", {
        error: "Incorrect name or password.",
        pageTitle: "Sign In",
      });
    }

    req.session.user = result.rows[0];
    res.redirect("/");
  } catch (err) {
    console.error("Error signing in:", err);
    res.status(500).send("Error signing in");
  }
});

app.post("/signout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error signing out:", err);
      return next(err);
    }

    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

app.get("/create-post", requireSignIn, async (req, res) => {
  res.render("editor.ejs", {
    post: null,
    pageTitle: "Create",
    user: req.session.user,
  });
});

app.post("/create-post", requireSignIn, async (req, res) => {
  const { title, content } = req.body;

  if (!title?.trim() || !content?.trim()) {
    return res.status(400).send("Title and content are required.");
  }

  const user = req.session.user;

  try {
    await pool.query(
      `INSERT INTO blogs
         (title, body, creator_name, creator_user_id, date_created)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [title.trim(), content.trim(), user.name, user.user_id],
    );

    res.redirect("/");
  } catch (err) {
    console.error("Error creating blog post:", err);
    res.status(500).send("Error creating blog post");
  }
});

app.get("/edit-post/:id", requireSignIn, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).send("Invalid blog post ID");
  }

  try {
    const result = await pool.query(
      `SELECT
         blog_id AS id,
         title,
         body AS content
       FROM blogs
       WHERE blog_id = $1 AND creator_user_id = $2`,
      [id, req.session.user.user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Blog post not found");
    }

    res.render("editor.ejs", {
      post: result.rows[0],
      pageTitle: "Edit",
      user: req.session.user,
    });
  } catch (err) {
    console.error("Error fetching blog post:", err);
    res.status(500).send("Error fetching blog post");
  }
});

app.put("/edit-post/:id", requireSignIn, async (req, res) => {
  const id = Number(req.params.id);
  const { title, content } = req.body;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).send("Invalid blog post ID");
  }

  if (!title?.trim() || !content?.trim()) {
    return res.status(400).send("Title and content are required.");
  }

  try {
    const result = await pool.query(
      `UPDATE blogs
       SET title = $1, body = $2
       WHERE blog_id = $3 AND creator_user_id = $4
       RETURNING blog_id`,
      [title.trim(), content.trim(), id, req.session.user.user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Blog post not found");
    }

    res.redirect("/");
  } catch (err) {
    console.error("Error updating blog post:", err);
    res.status(500).send("Error updating blog post");
  }
});

app.delete("/delete-post/:id", requireSignIn, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).send("Invalid blog post ID");
  }

  try {
    const result = await pool.query(
      `DELETE FROM blogs
       WHERE blog_id = $1 AND creator_user_id = $2
       RETURNING blog_id`,
      [id, req.session.user.user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Blog post not found");
    }

    res.redirect("/");
  } catch (err) {
    console.error("Error deleting blog post:", err);
    res.status(500).send("Error deleting blog post");
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
