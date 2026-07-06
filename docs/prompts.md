---

USED CLAUDE CODE

---


/plan Based on the objective stated in @docs/objective.spec.md we are going to create the application that fulfills the tasks from boilerplate code to complete application. For this you are going to assume the role of an expert UI designer and frontend expert in React and backend expert in Go. Aside from the constraints presented in the document the following design decisions are taken beforehand:-

* There must be one folder for backend and one for frontend
* The calculator must be open to extension in the future by enabling operation composition and grouping (e.g (5 + 1)/3 ) so a LISP-like approach (eg: (+ 1 2)) in a JSON structure is prefered: {"+" : [{"-": "1", "2"}, "3"]}. In this first scope only the basic operations are permited as per the objectives spec.
* There must be an option to clear the current value and set it to zero
* The calculator must store and preserve the result of the latest operation which can be reused on a consecutive operation
* The syntax of a stated operation must be validated (e.g no missing operands for binary operations, correct operation order, no previous answer to operate with, etc)
* Endpoints must follow RESTful conventions on resource hierarchy
* To prevent rounding errors when parsing numbers, they must be treated as strings and processed as 

Do not make assumptions, if there are any key points to bear in mind, ask me follow up questions. Output the plan in docs/

---

* Last result / previous answer must live in the frontend 
* Optional operations are out of scope for the first iteration
* Docker deployment is included

---

Outputs `implementation-plan.md`

---

Adjustments: There must be integration tests to evaluate end to end for happy path and error cases. Use tailwind as styling library. The whole expression must be displayed in the frontend until the POST conditions are fulfilled so in the display must appear for example 5 + 5. When there is an answer and the user clicks on a number, the answer must be replaced by the new value.

---

 Lets create an execution plan for the implementation-plan so we can have parallelizable tasks

---

/code-review bear in mind the criteria specified in the objective docs

--

Apply suggestions having as acceptance criteria what is established in the objectives documentation

-- 

/compact

--

/plan Based on the implementation made, we are ready to extend functionality to the optional operations of @docs/objective.spec.md. Be sure to implement them using the architecture already defined and add necessary unit testing to assert that the behavior is correct. For each operation have the following considerations:

Square Root
* Negative values are not allowed for a root value
* It must be handled as a unary standalone operator since it affects the expression within
  
Percentage
* It must be handled as a unary operator since it only affects the number before it
* This must be evaluated with an equal sent or another operation

This must be made on another plan document. Again, do not make assumptions and ask me for validation. 


In the construction don't forget to include the integration tests

---

/code-review bear in mind the criteria specified in the objective docs

--