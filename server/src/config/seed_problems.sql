-- Insert 5 Sample Problems for ThinkFlow

-- Problem 1: Two Sum (Easy)
INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
VALUES (
  'Two Sum',
  'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

You can return the answer in any order.',
  'easy',
  '[
    {"input": {"nums": [2,7,11,15], "target": 9}},
    {"input": {"nums": [3,2,4], "target": 6}},
    {"input": {"nums": [3,3], "target": 6}}
  ]'::jsonb,
  '[
    {"output": [0,1]},
    {"output": [1,2]},
    {"output": [0,1]}
  ]'::jsonb,
  '• 2 <= nums.length <= 104
• -109 <= nums[i] <= 109
• -109 <= target <= 109
• Only one valid answer exists.',
  '[
    {"input": {"nums": [2,7,11,15], "target": 9}, "output": [0,1], "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]."},
    {"input": {"nums": [3,2,4], "target": 6}, "output": [1,2], "explanation": "Because nums[1] + nums[2] == 6, we return [1, 2]."}
  ]'::jsonb
);

-- Problem 2: Reverse String (Easy)
INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
VALUES (
  'Reverse String',
  'Write a function that reverses a string. The input string is given as an array of characters s.

You must do this by modifying the input array in-place with O(1) extra memory.',
  'easy',
  '[
    {"input": {"s": ["h","e","l","l","o"]}},
    {"input": {"s": ["H","a","n","n","a","h"]}},
    {"input": {"s": ["A"," ","m","a","n"]}}
  ]'::jsonb,
  '[
    {"output": ["o","l","l","e","h"]},
    {"output": ["h","a","n","n","a","H"]},
    {"output": ["n","a","m"," ","A"]}
  ]'::jsonb,
  '• 1 <= s.length <= 105
• s[i] is a printable ascii character.',
  '[
    {"input": {"s": ["h","e","l","l","o"]}, "output": ["o","l","l","e","h"], "explanation": "Reverse the characters in the array."},
    {"input": {"s": ["H","a","n","n","a","h"]}, "output": ["h","a","n","n","a","H"], "explanation": "Reverse the string Hannah."}
  ]'::jsonb
);

-- Problem 3: Valid Palindrome (Easy)
INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
VALUES (
  'Valid Palindrome',
  'A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward. Alphanumeric characters include letters and numbers.

Given a string s, return true if it is a palindrome, or false otherwise.',
  'easy',
  '[
    {"input": {"s": "A man, a plan, a canal: Panama"}},
    {"input": {"s": "race a car"}},
    {"input": {"s": " "}}
  ]'::jsonb,
  '[
    {"output": true},
    {"output": false},
    {"output": true}
  ]'::jsonb,
  '• 1 <= s.length <= 2 * 105
• s consists only of printable ASCII characters.',
  '[
    {"input": {"s": "A man, a plan, a canal: Panama"}, "output": true, "explanation": "After processing, it becomes amanaplanacanalpanama which is a palindrome."},
    {"input": {"s": "race a car"}, "output": false, "explanation": "After processing, it becomes raceacar which is not a palindrome."}
  ]'::jsonb
);

-- Problem 4: Maximum Subarray (Medium)
INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
VALUES (
  'Maximum Subarray',
  'Given an integer array nums, find the subarray with the largest sum, and return its sum.

A subarray is a contiguous part of an array.',
  'medium',
  '[
    {"input": {"nums": [-2,1,-3,4,-1,2,1,-5,4]}},
    {"input": {"nums": [1]}},
    {"input": {"nums": [5,4,-1,7,8]}}
  ]'::jsonb,
  '[
    {"output": 6},
    {"output": 1},
    {"output": 23}
  ]'::jsonb,
  '• 1 <= nums.length <= 105
• -104 <= nums[i] <= 104',
  '[
    {"input": {"nums": [-2,1,-3,4,-1,2,1,-5,4]}, "output": 6, "explanation": "The subarray [4,-1,2,1] has the largest sum 6."},
    {"input": {"nums": [1]}, "output": 1, "explanation": "The subarray [1] has the largest sum 1."}
  ]'::jsonb
);

-- Problem 5: Merge Intervals (Medium)
INSERT INTO problems (title, description, difficulty, test_cases, expected_outputs, constraints, examples)
VALUES (
  'Merge Intervals',
  'Given an array of intervals where intervals[i] = [starti, endi], merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.',
  'medium',
  '[
    {"input": {"intervals": [[1,3],[2,6],[8,10],[15,18]]}},
    {"input": {"intervals": [[1,4],[4,5]]}},
    {"input": {"intervals": [[1,4],[0,4]]}}
  ]'::jsonb,
  '[
    {"output": [[1,6],[8,10],[15,18]]},
    {"output": [[1,5]]},
    {"output": [[0,4]]}
  ]'::jsonb,
  '• 1 <= intervals.length <= 104
• intervals[i].length == 2
• 0 <= starti <= endi <= 104',
  '[
    {"input": {"intervals": [[1,3],[2,6],[8,10],[15,18]]}, "output": [[1,6],[8,10],[15,18]], "explanation": "Since intervals [1,3] and [2,6] overlap, merge them into [1,6]."},
    {"input": {"intervals": [[1,4],[4,5]]}, "output": [[1,5]], "explanation": "Intervals [1,4] and [4,5] are considered overlapping."}
  ]'::jsonb
);
