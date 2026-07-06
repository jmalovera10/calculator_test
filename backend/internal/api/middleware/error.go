package middleware

import (
	"github.com/gin-gonic/gin"

	"calculator-backend/internal/api/dto"
)

// RespondError writes a consistent JSON error envelope and aborts the
// request with the given HTTP status.
func RespondError(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, dto.ErrorResponse{
		Error: dto.ErrorBody{Code: code, Message: message},
	})
}
