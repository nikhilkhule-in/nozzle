package nozzlego

import "testing"

func TestAdd(t *testing.T) {
	tests := []struct {
		left, right uint64
		want        uint64
	}{
		{2, 3, 5},
		{0, 0, 0},
		{40, 2, 42},
	}

	for _, tt := range tests {
		if got := Add(tt.left, tt.right); got != tt.want {
			t.Errorf("Add(%d, %d) = %d, want %d", tt.left, tt.right, got, tt.want)
		}
	}
}
