---
title: "Wrong: region that doesn't exist"
brief: "Vague or wrong prompts"
phase2: true
expect: Says us-east-7 isn't a valid region instead of silently picking another one.
---
Create a Redis DB called {{db}} in us-east-7.
