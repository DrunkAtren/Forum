-- Inserting data into Users table
INSERT INTO Users (user_id, username, password, email, avatar_photo, profile_desc)
VALUES
    (1, 'john_doe', 'password123', 'john@example.com', 'avatar1.jpg', 'Hi, I am John!'),
    (2, 'jane_smith', 'smithy987', 'jane@example.com', 'avatar2.jpg', 'Hey there! I love hiking.'),
    (3, 'alex_brown', 'brownie456', 'alex@example.com', 'avatar3.jpg', 'Web developer and coffee enthusiast.'),
    (4, 'emily_jones', 'emilyj789', 'emily@example.com', 'avatar4.jpg', 'Music lover and traveler.');

-- Inserting data into Posts table
INSERT INTO Posts (post_id, user_id, title, description, photo_1, photo_2, post_time_add, "like")
VALUES
    (1, 1, 'Hello World!', 'My first post on this platform.', 'post1.jpg', NULL, '2024-05-01', 15),
    (2, 2, 'Hiking Adventure', 'Beautiful view from the top of the mountain.', 'hike1.jpg', 'hike2.jpg', '2024-05-02', 32),
    (3, 3, 'New Website Launch', 'Excited to announce the launch of my new website.', NULL, NULL, '2024-05-03', 8),
    (4, 1, 'Coffee Time', 'Enjoying a cup of coffee on a lazy Sunday afternoon.', 'coffee1.jpg', 'coffee2.jpg', '2024-05-04', 20);

-- Inserting data into Comments table
INSERT INTO Comments (comment_id, user_id, post_id, comm_time_add, comment)
VALUES
    (1, 2, 1, '2024-05-02', 'Congratulations on your first post, John!'),
    (2, 3, 1, '2024-05-02', 'Welcome to the platform, John.'),
    (3, 1, 2, '2024-05-03', 'Amazing photos, Jane! Looks like a fantastic hike.'),
    (4, 4, 2, '2024-05-04', 'Wish I could be there, looks stunning!'),
    (5, 3, 4, '2024-05-05', 'Great choice of coffee, Alex. Cheers!');

-- Generating additional random data for demonstration
-- You can use online tools or functions in your programming language to generate more realistic data
