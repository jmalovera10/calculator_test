package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"calculator-backend/internal/api/dto"
	"calculator-backend/internal/api/middleware"
	"calculator-backend/internal/expression"
)

// CalculationHandler handles the /api/v1/calculations resource.
type CalculationHandler struct{}

// NewCalculationHandler constructs a CalculationHandler.
func NewCalculationHandler() *CalculationHandler {
	return &CalculationHandler{}
}

// Create evaluates the expression tree in the request body and returns the
// result, or a JSON error envelope describing what went wrong.
func (h *CalculationHandler) Create(c *gin.Context) {
	var req dto.CalculationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		middleware.RespondError(c, http.StatusBadRequest, "INVALID_JSON", err.Error())
		return
	}
	if req.Expression == nil {
		middleware.RespondError(c, http.StatusBadRequest, "INVALID_JSON", `missing required field "expression"`)
		return
	}

	result, err := expression.Evaluate(*req.Expression)
	if err != nil {
		if evalErr, ok := err.(*expression.EvalError); ok {
			middleware.RespondError(c, http.StatusBadRequest, evalErr.Code, evalErr.Message)
			return
		}
		middleware.RespondError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "unexpected error")
		return
	}

	c.JSON(http.StatusOK, dto.CalculationResponse{Result: expression.FormatResult(result)})
}
