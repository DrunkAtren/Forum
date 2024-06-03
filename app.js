
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer=require('multer')
const app = express();
const fs = require('fs');

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/dashboard.html');
});
app.set('view engine', 'ejs');
// Middleware do obsługi sesji
const session = require('express-session');
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/images'); // Tworzy folder 'images' w folderze 'public'
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Connected to the blog_database.db.');
    });

    const selectUserQuery = "SELECT * FROM Users WHERE email = ?";
    db.get(selectUserQuery, [email], (err, row) => {
        if (err) {
            return console.error(err.message);
        }

        if (!row) {
            res.redirect('/login.html?UserDoesNotExist=true');
            return;
        }

        if (row.password !== password) {
            res.redirect('/login.html?IncorrectPassword=true');
            return;
        }

        // Zapisz nazwę użytkownika i jego ID w sesji
        req.session.user = row.username;
        req.session.user_id = row.user_id;

        res.redirect('/dashboard2');
    });
    
});
app.get('/register.html', (req, res) => {
    res.sendFile(__dirname + '/register.html');
});
app.post('/register', (req, res) => {
    const { username, email, password, confirm_password } = req.body;

    if (password !== confirm_password) {
        res.redirect('/register.html?PasswordsDoNotMatch=true');
        return;
    }

    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Connected to the blog_database.db.');
    });

    const checkUserExistsQuery = "SELECT * FROM Users WHERE username = ? OR email = ?";
    db.get(checkUserExistsQuery, [username, email], (err, row) => {
        if (err) {
            return console.error(err.message);
        }

        if (row) {
            res.redirect('/register.html?UserAlreadyExists=true');
            return;
        }

        const insertUserQuery = `INSERT INTO Users (username, email, password) VALUES (?, ?, ?)`;
        db.run(insertUserQuery, [username, email, password], function(err) {
            if (err) {
                return console.error(err.message);
            }
            console.log(`A row has been inserted with rowid ${this.lastID}`);
            req.session.user = username;
            req.session.user_id = this.lastID;
            res.redirect('/dashboard?registrationSuccess=true');
        });
    });

    db.close();
});
app.get('/dashboard2', (req, res) => {
    // Sprawdź, czy użytkownik jest zalogowany
    if (!req.session.user) {
        res.redirect('/login.html');
        return;
    }

    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Connected to the blog_database.db.');
    });

    const selectPostsQuery = `SELECT Posts.post_id, Users.username as author, title, description as content, photo, post_time_add as date,Posts.category,Posts.tags,
        COUNT(Comments.comment_id) as comments, "like" as upvotes
        FROM Posts 
        JOIN Users ON Posts.user_id = Users.user_id 
        LEFT JOIN Comments ON Posts.post_id = Comments.post_id 
        GROUP BY Posts.post_id 
        ORDER BY Posts.post_id DESC`;
    db.all(selectPostsQuery, (err, rows) => {
        if (err) {
            db.close();
            return console.error(err.message);
        }

        const postsWithComments = [];

        rows.forEach(row => {
            if (row.photo) {
                row.photo = '/images/' + row.photo; // Assuming your images are stored in the public/images directory
            }

            const selectCommentsQuery = `SELECT Comments.*, Users.username, Users.avatar_photo
                                          FROM Comments 
                                          JOIN Users ON Comments.user_id = Users.user_id 
                                          WHERE post_id = ?
                                          ORDER BY comm_time_add DESC`;
            db.all(selectCommentsQuery, [row.post_id], (err, comments) => {
                if (err) {
                    db.close();
                    return console.error(err.message);
                }

                row.comments = comments.map(comment => {
                    return {
                        ...comment,
                        avatar: '/img/Avatars/' + comment.avatar_photo // Assuming your avatars are stored in the /img/ directory
                    };
                });

                postsWithComments.push(row);

                if (postsWithComments.length === rows.length) {
                    res.render('dashboard2', { 
                        photo: rows,
                        posts: postsWithComments,
                        user: req.session.user // Przekazanie nazwy użytkownika do widoku
                    });
                }
            });
        });

        db.close(); // Close the database connection after all operations are completed
    });
});
app.get('/add-post', (req, res) => {
    // Sprawdź, czy użytkownik jest zalogowany
    if (!req.session.user) {
        res.redirect('/login.html');
        return;
    }

    res.render('add-post', {
        user: req.session.user // Przekazanie nazwy użytkownika do widoku
    });
});

app.post('/add-post', upload.single('Photo'), (req, res) => {
    if (!req.session.user) {
        res.redirect('/login.html');
        return;
    }

    const { title, content, categories, tags} = req.body;
    let Photo = req.file ? req.file.filename : null; // Zmieniamy zapis na nazwę pliku

    // Sprawdź czy plik został przesłany
    if (!req.file) {
        // If no file is uploaded, set Photo to null
        Photo = null;
    } else {
        // Sprawdź czy plik ma rozszerzenie PNG
        const extension = path.extname(req.file.originalname).toLowerCase();
        if (extension !== '.png') {
            // Jeśli nie jest to plik PNG, usuń plik i wyślij odpowiedź błędu
            fs.unlinkSync(req.file.path);
            res.status(400).send('Only PNG files are allowed');
            return;
        }
    }

    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        console.log('Connected to the blog_database.db.');

        const insertPostQuery = `INSERT INTO Posts (user_id, title, category, description, photo, tags, post_time_add) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`;

        db.run(insertPostQuery, [req.session.user_id, title, categories, content, Photo, tags], function(err) {
            if (err) {
                db.close();
                // Jeśli wystąpił błąd, usuń plik i wyślij odpowiedź błędu
                if (Photo) {
                    fs.unlinkSync(`public/images/${Photo}`);
                }
                return console.error(err.message);
            }
            res.redirect('/dashboard2');
        });
    });
});

app.post('/search-post', (req, res) => {
    if (!req.session.user) {
        res.redirect('/login.html');
        return;
    }
    
    const { search } = req.body;

    // Check if search term is empty
    if (!search.trim()) {
        // If search term is empty, render the dashboard with an empty result set
        res.render('dashboard2', { 
            photo: [],
            posts: [],
            user: req.session.user // Pass the user session information to the view
        });
        return;
    }

    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        console.log('Connected to the blog_database.db.');
    });
    
    try {
        const selectPostsQuery = `
            SELECT 
                Posts.post_id, 
                Users.username AS author, 
                title, 
                description AS content, 
                post_time_add AS date, 
                photo,
                category, 
                tags,
                COUNT(Comments.comment_id) AS comments, 
                "like" AS upvotes
            FROM 
                Posts 
            JOIN 
                Users ON Posts.user_id = Users.user_id 
            LEFT JOIN 
                Comments ON Posts.post_id = Comments.post_id 
            WHERE 
                title LIKE ? OR description LIKE ? OR tags LIKE ?
            GROUP BY 
                Posts.post_id`;
        const queryParams = [`%${search}%`, `%${search}%`, `%${search}%`]; // Using the search term for title, description, and tags search

        db.all(selectPostsQuery, queryParams, (err, rows) => {
            if (err) {
                console.error(err.message);
                return res.status(500).send('Internal Server Error');
            }

            const postsWithComments = [];

            if (rows.length === 0) {
                // If no results are found, render the dashboard with an empty result set
                res.render('dashboard2', { 
                    photo: [],
                    posts: [],
                    user: req.session.user // Pass the user session information to the view
                });
                return;
            }

            rows.forEach(row => {
                if (row.photo) {
                    row.photo = '/images/' + row.photo; // Assuming your images are stored in the public/images directory
                }

                const selectCommentsQuery = `SELECT Comments.*, Users.username, Users.avatar_photo
                                              FROM Comments 
                                              JOIN Users ON Comments.user_id = Users.user_id 
                                              WHERE post_id = ?
                                              ORDER BY comm_time_add DESC`;
                db.all(selectCommentsQuery, [row.post_id], (err, comments) => {
                    if (err) {
                        console.error(err.message);
                        return res.status(500).send('Internal Server Error');
                    }

                    row.comments = comments.map(comment => {
                        return {
                            ...comment,
                            avatar: '/img/Avatars/' + comment.avatar_photo // Assuming your avatars are stored in the /img/ directory
                        };
                    });

                    postsWithComments.push(row);

                    if (postsWithComments.length === rows.length) {
                        res.render('dashboard2', { 
                            photo: rows,
                            posts: postsWithComments,
                            user: req.session.user // Pass the user session information to the view
                        });
                    }
                });
            });

            db.close(); // Close the database connection after all operations are completed
        });
    } catch (error) {
        console.error(error.message);
        db.close();
        return res.status(500).send('Internal Server Error - LostConnectionWithDatabase');
    }
});

app.post('/add-comment', (req, res) => {
    // Sprawdź, czy użytkownik jest zalogowany
    if (!req.session.user || !req.session.user_id) {
        res.redirect('/login.html');
        return;
    }

    const { post_id, comment } = req.body;
    // if (!comment.trim()) {
    //     res.redirect('/dashboard2');
    //     return;
    // }

    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        console.log('Connected to the blog_database.db.');

        try {
            const insertCommentQuery = `INSERT INTO Comments (post_id, user_id, comment, comm_time_add) VALUES (?, ?, ?, datetime('now'))`;
            db.run(insertCommentQuery, [post_id, req.session.user_id, comment], function(err) {
                if (err) {
                    console.error(err.message);
                    db.close();
                    return res.status(500).send('Internal Server Error');
                }
                console.log(`A comment has been added to post ${post_id} by user ${req.session.user_id}`);
                db.close();
                res.redirect('/dashboard2');
            });
        } catch (error) {
            console.error(error.message);
            db.close();
            return res.status(500).send('Internal Server Error');
        }
    });
});

app.post('/delete-comment', (req, res) => {
    // Check if the user is logged in
    if (!req.session.user || !req.session.user_id) {
        res.redirect('/login.html');
        return;
    }

    const { comment_id } = req.body;

    // Open the database connection
    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        console.log('Connected to the blog_database.db.');

        try {
            // SQL query to delete the comment
            const deleteCommentQuery = `DELETE FROM Comments WHERE comment_id = ? AND user_id = ?`;

            // Execute the delete query
            db.run(deleteCommentQuery, [comment_id, req.session.user_id], function(err) {
                if (err) {
                    console.error(err.message);
                    db.close();
                    return res.status(500).send('Internal Server Error');
                }
                // Check if any rows were affected by the delete operation
                if (this.changes === 0) {
                    // No rows were affected, possibly due to unauthorized deletion
                    console.log(`Unauthorized attempt to delete comment ${comment_id} by user ${req.session.user_id}`);
                    db.close();
                    // Redirect to a suitable error page or handle the situation appropriately
                    return res.redirect('/error.html');
                }
                console.log(`Comment ${comment_id} has been deleted by user ${req.session.user_id}`);
                db.close();
                // Redirect back to the dashboard or the relevant page
                res.redirect('/dashboard2');
            });
        } catch (error) {
            console.error(error.message);
            db.close();
            return res.status(500).send('Internal Server Error');
        }
    });
});

app.post('/sort-by-date', (req, res) => {
    // Check if the user is logged in
    if (!req.session.user) {
        res.redirect('/login.html');
        return;
    }

    // Connect to the database
    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        console.log('Connected to the blog_database.db.');
    });

    // Query to select posts sorted by date
    const selectPostsQuery = `
        SELECT 
            Posts.post_id, 
            Users.username as author, 
            title, 
            description as content, 
            photo, 
            post_time_add as date,
            Posts.category,
            Posts.tags,
            COUNT(Comments.comment_id) as comments, 
            "like" as upvotes
        FROM 
            Posts 
        JOIN 
            Users ON Posts.user_id = Users.user_id 
        LEFT JOIN 
            Comments ON Posts.post_id = Comments.post_id 
        GROUP BY 
            Posts.post_id 
        ORDER BY 
            date ASC`;

    // Execute the query
    db.all(selectPostsQuery, (err, rows) => {
        if (err) {
            console.error(err.message);
            db.close(); // Close the database connection in case of an error
            return res.status(500).send('Internal Server Error');
        }

        const postsWithComments = [];

        // Iterate through each post
        rows.forEach(post => {
            if (post.photo) {
                post.photo = '/images/' + post.photo; // Assuming your images are stored in the public/images directory
            }

            // Query to select comments for the current post
            const selectCommentsQuery = `
                SELECT 
                    Comments.*, 
                    Users.username, 
                    Users.avatar_photo
                FROM 
                    Comments 
                JOIN 
                    Users ON Comments.user_id = Users.user_id 
                WHERE 
                    post_id = ?
                ORDER BY 
                    comm_time_add DESC`;

            // Execute the query to retrieve comments
            db.all(selectCommentsQuery, [post.post_id], (err, comments) => {
                if (err) {
                    console.error(err.message);
                    db.close(); // Close the database connection in case of an error
                    return res.status(500).send('Internal Server Error');
                }

                // Map comments to include avatar information
                post.comments = comments.map(comment => ({
                    ...comment,
                    avatar: '/img/Avatars/' + comment.avatar_photo
                }));

                // Add the post to the array
                postsWithComments.push(post);

                // If all posts have been processed, render the dashboard
                if (postsWithComments.length === rows.length) {
                    db.close(); // Close the database connection
                    res.render('dashboard2', { 
                        photo: rows,
                        posts: postsWithComments,
                        user: req.session.user
                    });
                }
            });
        });
    });
});

app.post('/delete-post', (req, res) => {
    // Check if the user is logged in
    if (!req.session.user || !req.session.user_id) {
        res.redirect('/login.html');
        return;
    }

    const { post_id } = req.body;

    // Open the database connection
    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        console.log('Connected to the blog_database.db.');

        try {
            // SQL query to delete the post
            const deletePostQuery = `DELETE FROM Posts WHERE post_id = ? AND user_id = ?`;

            // Execute the delete query
            db.run(deletePostQuery, [post_id, req.session.user_id], function(err) {
                if (err) {
                    console.error(err.message);
                    db.close();
                    return res.status(500).send('Internal Server Error');
                }
                // Check if any rows were affected by the delete operation
                if (this.changes === 0) {
                    // No rows were affected, possibly due to unauthorized deletion
                    console.log(`Unauthorized attempt to delete post ${post_id} by user ${req.session.user_id}`);
                    db.close();
                    // Redirect to a suitable error page or handle the situation appropriately
                    return res.redirect('/error.html');
                }
                console.log(`Post ${post_id} has been deleted by user ${req.session.user_id}`);
                db.close();
                // Redirect back to the dashboard or the relevant page
                res.redirect('/dashboard2');
            });
        } catch (error) {
            console.error(error.message);
            db.close();
            return res.status(500).send('Internal Server Error');
        }
    });
});

app.get('/Users', (req, res) => {
    if (!req.session.user || !req.session.user_id) {
        res.redirect('/login.html');
        return;
    }

    // Connect to the SQLite3 database
    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return;
        }
        console.log('Connected to the blog_database.db database.');
    });

    // Select all users from the Users table
    const selectUsersQuery = 'SELECT * FROM Users';

    // Execute the query
    db.all(selectUsersQuery, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            return;
        }
        
        // Close the database connection
        db.close();

        // Render the 'Users.ejs' template with the user data
        res.render('Users', { users: rows,
            user: req.session.user
         });
        
    });
});

app.get('/About', (req, res) => {
    if (!req.session.user || !req.session.user_id) {
        res.redirect('/login.html');
        return;
    }
        // Render the 'Users.ejs' template with the user data
        res.render('about', { 
            user: req.session.user
        });
});

app.get('/Faq', (req, res) => {
    if (!req.session.user || !req.session.user_id) {
        res.redirect('/login.html');
        return;
    }
        // Render the 'Users.ejs' template with the user data
        res.render('faq', { 
            user: req.session.user
        });
});


app.post('/search-post-official-news', (req, res) => {
    if (!req.session.user) {
        res.redirect('/login.html');
        return;
    }
    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        console.log('Connected to the blog_database.db.');
    });

    try {
        const selectPostsQuery = `
            SELECT 
                Posts.post_id, 
                Users.username AS author, 
                title, 
                description AS content, 
                post_time_add AS date, 
                photo,
                category, 
                tags,
                COUNT(Comments.comment_id) AS comments, 
                "like" AS upvotes
            FROM 
                Posts 
            JOIN 
                Users ON Posts.user_id = Users.user_id 
            LEFT JOIN 
                Comments ON Posts.post_id = Comments.post_id 
            WHERE 
                category = 'Official News'`;

        db.all(selectPostsQuery, (err, rows) => {
            if (err) {
                console.error(err.message);
                return res.status(500).send('Internal Server Error');
            }

            const postsWithComments = [];

            if (rows.length === 0) {
                // If no results are found, render the dashboard with an empty result set
                res.render('dashboard2', { 
                    photo: [],
                    posts: [],
                    user: req.session.user // Pass the user session information to the view
                });
                return;
            }

            rows.forEach(row => {
                if (row.photo) {
                    row.photo = '/images/' + row.photo; // Assuming your images are stored in the public/images directory
                }

                const selectCommentsQuery = `SELECT Comments.*, Users.username, Users.avatar_photo
                                              FROM Comments 
                                              JOIN Users ON Comments.user_id = Users.user_id 
                                              WHERE post_id = ?
                                              ORDER BY comm_time_add DESC`;
                db.all(selectCommentsQuery, [row.post_id], (err, comments) => {
                    if (err) {
                        console.error(err.message);
                        return res.status(500).send('Internal Server Error');
                    }

                    row.comments = comments.map(comment => {
                        return {
                            ...comment,
                            avatar: '/img/Avatars/' + comment.avatar_photo // Assuming your avatars are stored in the /img/ directory
                        };
                    });

                    postsWithComments.push(row);

                    if (postsWithComments.length === rows.length) {
                        res.render('dashboard2', { 
                            photo: rows,
                            posts: postsWithComments,
                            user: req.session.user // Pass the user session information to the view
                        });
                    }
                });
            });

            db.close(); // Close the database connection after all operations are completed
        });
    } catch (error) {
        console.error(error.message);
        db.close();
        return res.status(500).send('Internal Server Error - LostConnectionWithDatabase');
    }
});

app.post('/search-post-Game-Discussion', (req, res) => {
    if (!req.session.user) {
        res.redirect('/login.html');
        return;
    }
    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        console.log('Connected to the blog_database.db.');
    });

    try {
        const selectPostsQuery = `
            SELECT 
                Posts.post_id, 
                Users.username AS author, 
                title, 
                description AS content, 
                post_time_add AS date, 
                photo,
                category, 
                tags,
                COUNT(Comments.comment_id) AS comments, 
                "like" AS upvotes
            FROM 
                Posts 
            JOIN 
                Users ON Posts.user_id = Users.user_id 
            LEFT JOIN 
                Comments ON Posts.post_id = Comments.post_id 
            WHERE 
                category = 'Game Discussion'`;

        db.all(selectPostsQuery, (err, rows) => {
            if (err) {
                console.error(err.message);
                return res.status(500).send('Internal Server Error');
            }

            const postsWithComments = [];

            if (rows.length === 0) {
                // If no results are found, render the dashboard with an empty result set
                res.render('dashboard2', { 
                    photo: [],
                    posts: [],
                    user: req.session.user // Pass the user session information to the view
                });
                return;
            }

            rows.forEach(row => {
                if (row.photo) {
                    row.photo = '/images/' + row.photo; // Assuming your images are stored in the public/images directory
                }

                const selectCommentsQuery = `SELECT Comments.*, Users.username, Users.avatar_photo
                                              FROM Comments 
                                              JOIN Users ON Comments.user_id = Users.user_id 
                                              WHERE post_id = ?
                                              ORDER BY comm_time_add DESC`;
                db.all(selectCommentsQuery, [row.post_id], (err, comments) => {
                    if (err) {
                        console.error(err.message);
                        return res.status(500).send('Internal Server Error');
                    }

                    row.comments = comments.map(comment => {
                        return {
                            ...comment,
                            avatar: '/img/Avatars/' + comment.avatar_photo // Assuming your avatars are stored in the /img/ directory
                        };
                    });

                    postsWithComments.push(row);

                    if (postsWithComments.length === rows.length) {
                        res.render('dashboard2', { 
                            photo: rows,
                            posts: postsWithComments,
                            user: req.session.user // Pass the user session information to the view
                        });
                    }
                });
            });

            db.close(); // Close the database connection after all operations are completed
        });
    } catch (error) {
        console.error(error.message);
        db.close();
        return res.status(500).send('Internal Server Error - LostConnectionWithDatabase');
    }
});

app.post('/search-post-Suggestions', (req, res) => {
    if (!req.session.user) {
        res.redirect('/login.html');
        return;
    }
    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        console.log('Connected to the blog_database.db.');
    });

    try {
        const selectPostsQuery = `
            SELECT 
                Posts.post_id, 
                Users.username AS author, 
                title, 
                description AS content, 
                post_time_add AS date, 
                photo,
                category, 
                tags,
                COUNT(Comments.comment_id) AS comments, 
                "like" AS upvotes
            FROM 
                Posts 
            JOIN 
                Users ON Posts.user_id = Users.user_id 
            LEFT JOIN 
                Comments ON Posts.post_id = Comments.post_id 
            WHERE 
                category = 'Suggestions'`;

        db.all(selectPostsQuery, (err, rows) => {
            if (err) {
                console.error(err.message);
                return res.status(500).send('Internal Server Error');
            }

            const postsWithComments = [];

            if (rows.length === 0) {
                // If no results are found, render the dashboard with an empty result set
                res.render('dashboard2', { 
                    photo: [],
                    posts: [],
                    user: req.session.user // Pass the user session information to the view
                });
                return;
            }

            rows.forEach(row => {
                if (row.photo) {
                    row.photo = '/images/' + row.photo; // Assuming your images are stored in the public/images directory
                }

                const selectCommentsQuery = `SELECT Comments.*, Users.username, Users.avatar_photo
                                              FROM Comments 
                                              JOIN Users ON Comments.user_id = Users.user_id 
                                              WHERE post_id = ?
                                              ORDER BY comm_time_add DESC`;
                db.all(selectCommentsQuery, [row.post_id], (err, comments) => {
                    if (err) {
                        console.error(err.message);
                        return res.status(500).send('Internal Server Error');
                    }

                    row.comments = comments.map(comment => {
                        return {
                            ...comment,
                            avatar: '/img/Avatars/' + comment.avatar_photo // Assuming your avatars are stored in the /img/ directory
                        };
                    });

                    postsWithComments.push(row);

                    if (postsWithComments.length === rows.length) {
                        res.render('dashboard2', { 
                            photo: rows,
                            posts: postsWithComments,
                            user: req.session.user // Pass the user session information to the view
                        });
                    }
                });
            });

            db.close(); // Close the database connection after all operations are completed
        });
    } catch (error) {
        console.error(error.message);
        db.close();
        return res.status(500).send('Internal Server Error - LostConnectionWithDatabase');
    }
});

app.post('/search-post-Technical-Support', (req, res) => {
    if (!req.session.user) {
        res.redirect('/login.html');
        return;
    }
    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Internal Server Error');
        }
        console.log('Connected to the blog_database.db.');
    });

    try {
        const selectPostsQuery = `
            SELECT 
                Posts.post_id, 
                Users.username AS author, 
                title, 
                description AS content, 
                post_time_add AS date, 
                photo,
                category, 
                tags,
                COUNT(Comments.comment_id) AS comments, 
                "like" AS upvotes
            FROM 
                Posts 
            JOIN 
                Users ON Posts.user_id = Users.user_id 
            LEFT JOIN 
                Comments ON Posts.post_id = Comments.post_id 
            WHERE 
                category = 'Technical Support'`;

        db.all(selectPostsQuery, (err, rows) => {
            if (err) {
                console.error(err.message);
                return res.status(500).send('Internal Server Error');
            }

            const postsWithComments = [];

            if (rows.length === 0) {
                // If no results are found, render the dashboard with an empty result set
                res.render('dashboard2', { 
                    photo: [],
                    posts: [],
                    user: req.session.user // Pass the user session information to the view
                });
                return;
            }

            rows.forEach(row => {
                if (row.photo) {
                    row.photo = '/images/' + row.photo; // Assuming your images are stored in the public/images directory
                }

                const selectCommentsQuery = `SELECT Comments.*, Users.username, Users.avatar_photo
                                              FROM Comments 
                                              JOIN Users ON Comments.user_id = Users.user_id 
                                              WHERE post_id = ?
                                              ORDER BY comm_time_add DESC`;
                db.all(selectCommentsQuery, [row.post_id], (err, comments) => {
                    if (err) {
                        console.error(err.message);
                        return res.status(500).send('Internal Server Error');
                    }

                    row.comments = comments.map(comment => {
                        return {
                            ...comment,
                            avatar: '/img/Avatars/' + comment.avatar_photo // Assuming your avatars are stored in the /img/ directory
                        };
                    });

                    postsWithComments.push(row);

                    if (postsWithComments.length === rows.length) {
                        res.render('dashboard2', { 
                            photo: rows,
                            posts: postsWithComments,
                            user: req.session.user // Pass the user session information to the view
                        });
                    }
                });
            });

            db.close(); // Close the database connection after all operations are completed
        });
    } catch (error) {
        console.error(error.message);
        db.close();
        return res.status(500).send('Internal Server Error - LostConnectionWithDatabase');
    }
});


app.post('/save-post-json', (req, res) => {
    const postId = req.body.post_id; // Pobierz ID posta z formularza

    // Pobierz pozostałe dane posta z bazy danych na podstawie postId
    let db = new sqlite3.Database('./blog_database.db', (err) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Database error');
            return;
        }
        console.log('Connected to the blog_database.db.');
    });

    const selectPostQuery = `SELECT * FROM Posts WHERE post_id = ?`;
    db.get(selectPostQuery, [postId], (err, row) => {
        if (err) {
            db.close();
            console.error(err.message);
            res.status(500).send('Database error');
            return;
        }

        if (!row) {
            db.close();
            res.status(404).send('Post not found');
            return;
        }

        // Utwórz obiekt posta w formacie JSON
        const postObject = {
            post_id: row.post_id,
            title: row.title,
            description: row.description,
            category: row.category,
            tags: row.tags,
            // Dodaj pozostałe pola posta, jeśli są potrzebne
        };

        // Zapisz obiekt posta do pliku JSON
        const fs = require('fs');
        const fileName = `post_${postId}.json`; // Nazwa pliku JSON

        fs.writeFile(fileName, JSON.stringify(postObject, null, 4), (err) => {
            db.close();
            if (err) {
                console.error(err);
                res.status(500).send('Error saving post to JSON file');
                return;
            }
            console.log(`Post saved to ${fileName}`);
            res.send('Post saved to JSON file');
        });
    });
});

app.use((req, res) => {
    res.status(404).send('<h1>Error 404: Resource not found</h1>');
});
app.listen(3000, () => {
    console.log("Start on port 3000");
});
